
import os
import json

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types

load_dotenv()

app = FastAPI(title="Prism AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
model_name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

client = genai.Client(api_key=api_key) if api_key else None

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB per file

TEXT_EXTENSIONS = {
    ".txt", ".md", ".csv", ".json", ".py", ".js",
    ".ts", ".tsx", ".html", ".css", ".xml", ".log",
}

ALLOWED_INLINE_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/chat")
async def chat(
    prompt: str = Form(""),
    files: list[UploadFile] = File(default=[]),
):
    if client is None:
        return {
            "error": "GEMINI_API_KEY is missing in backend/.env"
        }

    contents = [
        types.Part.from_text(
            text=prompt.strip() or "Please analyze the attached files."
        )
    ]

    for uploaded in files:
        data = await uploaded.read()
        filename = uploaded.filename or "uploaded_file"
        extension = os.path.splitext(filename)[1].lower()
        mime_type = (
            uploaded.content_type or "application/octet-stream"
        ).split(";")[0].strip().lower()

        if len(data) > MAX_FILE_SIZE:
            return {
                "error": f"{filename} exceeds the 15 MB file limit."
            }

        if extension in TEXT_EXTENSIONS:
            text_content = data.decode("utf-8", errors="replace")
            contents.append(
                types.Part.from_text(
                    text=f"\n\nFile: {filename}\n{text_content}"
                )
            )

        elif mime_type in ALLOWED_INLINE_TYPES:
            contents.append(
                types.Part.from_text(text=f"Attached file: {filename}")
            )
            contents.append(
                types.Part.from_bytes(
                    data=data,
                    mime_type=mime_type,
                )
            )

        else:
            contents.append(
                types.Part.from_text(
                    text=(
                        f"The file {filename} could not be processed. "
                        "Explain that this file type is unsupported."
                    )
                )
            )

    async def generate():
        try:
            response = client.models.generate_content_stream(
                model=model_name,
                contents=contents,
            )

            for chunk in response:
                if chunk.text:
                    yield (
                        "data: "
                        + json.dumps({"text": chunk.text})
                        + "\n\n"
                    )

            yield "data: [DONE]\n\n"

        except Exception as exc:
            yield (
                "data: "
                + json.dumps({"error": str(exc)})
                + "\n\n"
            )

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
