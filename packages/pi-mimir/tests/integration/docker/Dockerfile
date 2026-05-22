FROM node:24-bookworm

ENV HOME=/tmp/pi-home
ENV PI_CODING_AGENT_DIR=/tmp/pi-home/.pi/agent
ENV PI_OFFLINE=1

WORKDIR /workspace/pi-mimir-workflow/packages/pi-mimir
COPY . /workspace/pi-mimir-workflow

RUN npm install -g @earendil-works/pi-coding-agent

CMD ["node", "--experimental-strip-types", "tests/integration/run-e2e.ts"]
