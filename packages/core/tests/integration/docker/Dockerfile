FROM node:24-bookworm

ENV HOME=/tmp/pi-home
ENV PI_CODING_AGENT_DIR=/tmp/pi-home/.pi/agent
ENV PI_OFFLINE=1

WORKDIR /workspace/pi-openspec-workflow/packages/core
COPY . /workspace/pi-openspec-workflow

RUN npm install -g @earendil-works/pi-coding-agent

CMD ["node", "--experimental-strip-types", "tests/integration/run-e2e.ts"]
