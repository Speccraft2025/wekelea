FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --only=production --omit=dev || npm install --only=production

COPY . .

RUN npm install -g typescript && npm run build

EXPOSE 5001

CMD ["npm", "start"]
