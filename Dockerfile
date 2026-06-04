FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

COPY . .
RUN node build-game.mjs

EXPOSE 4000

CMD ["node", "server.js"]
