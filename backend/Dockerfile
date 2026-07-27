FROM node:26-alpine3.23

WORKDIR /

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD [ "node", "server.js" ]
