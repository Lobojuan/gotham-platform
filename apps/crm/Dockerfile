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
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js media-tools.js events-pages.js receptionist.js chat.js tts.js tts.py schema.sql assistant.md ./
COPY public ./public
RUN mkdir -p /data/media
ENV NODE_ENV=production MEDIA_DIR=/data/media
EXPOSE 4100
CMD ["node","server.js"]
