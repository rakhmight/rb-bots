FROM node:20-alpine

WORKDIR /app
RUN apk add --no-cache tzdata

# Ускоряет и стабилизирует установки зависимостей
COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Если ваш entry-файл отличается — поменяйте команду ниже (см. README)
CMD ["node", "src/index.js"]
