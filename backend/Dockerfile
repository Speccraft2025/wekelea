# Build Stage
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install all dependencies (including devDependencies) to build the typescript code
RUN npm install

COPY . .

RUN npm run build

# Production Stage
FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy built code and database from builder
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/src/db ./dist/db

EXPOSE 5001

CMD ["npm", "start"]
