FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./

ARG VITE_SPOTIFY_CLIENT_ID
ARG VITE_SPOTIFY_REDIRECT_URI
ENV VITE_SPOTIFY_CLIENT_ID=${VITE_SPOTIFY_CLIENT_ID}
ENV VITE_SPOTIFY_REDIRECT_URI=${VITE_SPOTIFY_REDIRECT_URI}
RUN npm run build

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/songs ./songs
COPY --from=build /app/dist ./dist

EXPOSE 3001

CMD ["npm", "start"]
