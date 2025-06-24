rm -rf dist node_modules
scp -r ./* root@194.233.68.185:/home/dev/sellerpundit/auth
# ssh arya@103.135.36.92 "cd /home/arya/sellerpundit/auth && sudo docker compose down && sudo docker compose up dev -d"
