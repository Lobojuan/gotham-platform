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
# the receptionist demo's ears: Whisper speech-to-text (faster-whisper) and the free "base" model, on this server (nothing sent elsewhere).
# The model files are checked against their known fingerprints; a changed download stops the build.
RUN python3 -m venv /opt/whisper-venv && /opt/whisper-venv/bin/pip install --no-cache-dir faster-whisper==1.2.1 ctranslate2==4.6.2 \
 && mkdir -p /opt/whisper/base && cd /opt/whisper/base \
 && for f in config.json tokenizer.json vocabulary.txt model.bin; do curl -fsSL --retry 3 -o $f https://huggingface.co/Systran/faster-whisper-base/resolve/ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66/$f; done \
 && echo "56a6d8110d311f19c8f0471e562832c7527f146b567275bfca59fcf7c184da9a  config.json" | sha256sum -c - \
 && echo "fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab  tokenizer.json" | sha256sum -c - \
 && echo "34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913  vocabulary.txt" | sha256sum -c - \
 && echo "d01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9  model.bin" | sha256sum -c -
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js media-tools.js events-pages.js receptionist.js chat.js tts.js tts.py stt.js stt.py schema.sql assistant.md ./
COPY public ./public
RUN mkdir -p /data/media
ENV NODE_ENV=production MEDIA_DIR=/data/media
EXPOSE 4100
CMD ["node","server.js"]
