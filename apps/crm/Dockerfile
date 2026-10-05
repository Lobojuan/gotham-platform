FROM node:22-bookworm-slim
# ffmpeg: uploaded videos are converted to MP4 with the logo in the corner, and their recording date is read
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
# the receptionist demo's voice: Piper text-to-speech and the free "Jenny (Dioco)" voice (commercial use allowed, attribution
# on the demo page). The voice file is checked against its known fingerprint; a changed download stops the build.
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates curl && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/piper && /opt/piper/bin/pip install --no-cache-dir piper-tts==1.8.0 \
 && mkdir -p /opt/voices && cd /opt/voices \
 && curl -fsSL --retry 3 -o en_GB-jenny_dioco-medium.onnx https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx \
 && curl -fsSL --retry 3 -o en_GB-jenny_dioco-medium.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx.json \
 && echo "469c630d209e139dd392a66bf4abde4ab86390a0269c1e47b4e5d7ce81526b01  en_GB-jenny_dioco-medium.onnx" | sha256sum -c - \
 && echo "a9a7a93a317c9a3cb6563e37eb057df9ef09c06188a8a4341b0fcb58cba54dd4  en_GB-jenny_dioco-medium.onnx.json" | sha256sum -c -
# the receptionist demo's ears: Whisper speech-to-text (faster-whisper) and the free "tiny.en" (English, fast) and "base" (French, Spanish) models, on this server (nothing sent elsewhere).
# The model files are checked against their known fingerprints; a changed download stops the build.
RUN python3 -m venv /opt/whisper-venv && /opt/whisper-venv/bin/pip install --no-cache-dir faster-whisper==1.2.1 ctranslate2==4.6.2 \
 && mkdir -p /opt/whisper/base && cd /opt/whisper/base \
 && for f in config.json tokenizer.json vocabulary.txt model.bin; do curl -fsSL --retry 3 -o $f https://huggingface.co/Systran/faster-whisper-base/resolve/ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66/$f; done \
 && echo "56a6d8110d311f19c8f0471e562832c7527f146b567275bfca59fcf7c184da9a  config.json" | sha256sum -c - \
 && echo "fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab  tokenizer.json" | sha256sum -c - \
 && echo "34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913  vocabulary.txt" | sha256sum -c - \
 && echo "d01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9  model.bin" | sha256sum -c - \
 && mkdir -p /opt/whisper/tiny.en && cd /opt/whisper/tiny.en \
 && for f in config.json tokenizer.json vocabulary.txt model.bin; do curl -fsSL --retry 3 -o $f https://huggingface.co/Systran/faster-whisper-tiny.en/resolve/0d3d19a32d3338f10357c0889762bd8d64bbdeba/$f; done \
 && echo "14b1b421a90349bc551b881461426b561a874049cb9e4c4864f2ca384f6a7cc5  config.json" | sha256sum -c - \
 && echo "929c5252409436dce1b38a75d1abbcb5e132d170d8e324e4e04ed915fa2d22df  tokenizer.json" | sha256sum -c - \
 && echo "ff77588746d3a2595d32ab5b69ffd7b95ce2441ac57533cb66fc3eb575a115cf  vocabulary.txt" | sha256sum -c - \
 && echo "1a5afae06a4db91c975c9a9d78be5cc110ee4ea022ad57d55492e4550e936b2a  model.bin" | sha256sum -c -
WORKDIR /app
RUN python3 -m venv /opt/kokoro-venv && /opt/kokoro-venv/bin/pip install --no-cache-dir kokoro-onnx==0.6.1 soundfile==0.13.1 pdfplumber==0.11.9 \
 && mkdir -p /opt/kokoro && cd /opt/kokoro \
 && curl -fsSL --retry 3 -o kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx \
 && curl -fsSL --retry 3 -o voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin \
 && echo "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5  kokoro-v1.0.onnx" | sha256sum -c - \
 && echo "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d  voices-v1.0.bin" | sha256sum -c -
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js media-tools.js events-pages.js receptionist.js chat.js tts.js tts.py stt.js stt.py ask-voice.js ask-voice.py ask-welcome.json ghana-data.js ghana-pdf.py ghana-snapshot.json chat-knowledge.js research-checks.js research-sources.json schema.sql assistant.md ./
COPY public ./public
RUN mkdir -p /data/media
ENV NODE_ENV=production MEDIA_DIR=/data/media
EXPOSE 4100
CMD ["node","server.js"]
