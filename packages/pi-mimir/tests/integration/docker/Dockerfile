FROM node:24-bookworm

ENV HOME=/tmp/pi-home
ENV PI_CODING_AGENT_DIR=/tmp/pi-home/.pi/agent
ENV PI_OFFLINE=1

WORKDIR /workspace/pi-mimir-workflow
COPY . /workspace/pi-mimir-workflow

RUN npm install -g @earendil-works/pi-coding-agent

CMD ["npm", "run", "test:e2e", "--workspace", "pi-mimir"]
