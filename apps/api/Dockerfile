FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate
RUN npm run build --workspace @nuro7/api

FROM node:20-alpine
WORKDIR /app
# tzdata + TZ pin so Date.setHours()/new Date(y,m,d) operate in IST. Without
# this the container runs UTC, and attendance comparisons silently skew by
# +5:30 → every clock-in before ~15:40 IST gets flagged "On time".
RUN apk add --no-cache tzdata
ENV TZ=Asia/Kolkata
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
CMD ["node", "dist/main.js"]

