FROM node:20-bullseye

# Dependencias críticas para que Puppeteer corra en Debian
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]