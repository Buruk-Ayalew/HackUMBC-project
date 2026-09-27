# RegWise: one container serving the API and the built frontend (Cloud Run).
FROM node:24-slim
WORKDIR /app

# Dev dependencies are needed: tsx runs the server and Vite builds the client.
COPY . .
RUN npm ci && npm run build -w client

ENV NODE_ENV=production
# Cloud Run sets PORT (8080); the server reads it.
EXPOSE 8080
CMD ["npx", "tsx", "server/src/index.ts"]
