###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM node:18 As development

# Create app directory
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure copying both package.json AND package-lock.json (when available).
# Copying this first prevents re-running npm install on every code change.
COPY package*.json ./

# Install app dependencies using the `npm ci` command instead of `npm install`
RUN npm ci

# RUN apt-get update
# RUN apt-get install build-essential chrpath libssl-dev libxft-dev -y
# RUN apt-get install libfreetype6 libfreetype6-dev -y
# RUN apt-get install libfontconfig1 libfontconfig1-dev -y
# RUN apt-get install -y libnss3-dev 
# RUN apt-get install -y libgconf-2-4 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm-dev libnss3-dev libxss-dev libasound2-dev libxtst-dev libxss1 libasound2 libxtst6 libxshmfence-dev 
RUN apt-get update && apt-get install -y  gconf-service  libasound2  libatk1.0-0  libatk-bridge2.0-0  libc6  libcairo2  libcups2  libdbus-1-3  libexpat1  libfontconfig1  libgcc1  libgconf-2-4  libgdk-pixbuf2.0-0  libglib2.0-0  libgtk-3-0  libnspr4  libpango-1.0-0  libpangocairo-1.0-0  libstdc++6  libx11-6  libx11-xcb1  libxcb1  libxcomposite1  libxcursor1  libxdamage1  libxext6  libxfixes3  libxi6  libxrandr2  libxrender1  libxss1  libxtst6  ca-certificates  fonts-liberation  libappindicator1  libnss3  lsb-release  xdg-utils  wget libgbm-dev  && npm i puppeteer nodemon 



# Bundle app source
COPY . .

# Use the node user from the image (instead of the root user)
USER node