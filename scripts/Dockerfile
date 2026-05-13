FROM node:24-alpine
WORKDIR /scripts
COPY package.json ./
RUN npm install --omit=dev
COPY . .
CMD ["node", "send-logs.mjs"]
