FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5050
ENV DATA_DIR=/data

COPY package.json ./
COPY server.js ./
COPY public ./public

EXPOSE 5050
CMD ["npm", "start"]
