# Stage 1: Build the application
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Immediate OCR receipt review is enabled by default in production. Never default to false to prevent disabling capture review on technicians.
ARG NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED=true
ENV NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED=${NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED}
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# Stage 2: Runner
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk upgrade --no-cache && \
    addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Copy standalone build output and static files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
