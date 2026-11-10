FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
EXPOSE 5173

ENV VITE_API_URL=http://localhost:8080
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
