FROM node:22-alpine
WORKDIR /app

COPY package.json tsconfig.json tailwind.config.js postcss.config.js components.json patch-fs.js next.config.ts ./
COPY node_modules ./node_modules
COPY src ./src

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

RUN node --require ./patch-fs.js ./node_modules/next/dist/bin/next build

CMD ["node", "./node_modules/next/dist/bin/next", "start", "-p", "3000"]
