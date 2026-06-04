FROM node:24-bookworm

ENV HOME=/tmp/pi-home
ENV PI_CODING_AGENT_DIR=/tmp/pi-home/.pi/agent
ENV PI_OFFLINE=1

WORKDIR /workspace/pi-openspec-workflow
COPY . /workspace/pi-openspec-workflow

RUN corepack enable && npm install -g @earendil-works/pi-coding-agent

CMD ["pnpm", "--filter", "@casualjim/pi-openspec", "test:e2e"]
