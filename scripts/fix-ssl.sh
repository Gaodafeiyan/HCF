#!/bin/bash

echo "========================================="
echo "修复SSL配置"
echo "========================================="

# 1. 先创建一个不需要SSL的临时配置
echo "1. 创建临时Nginx配置（仅HTTP）..."
sudo tee /etc/nginx/sites-available/hcf-finance-temp <<EOF
# 临时HTTP配置
server {
    listen 80;
    server_name hcf-finance.xyz www.hcf-finance.xyz;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}

server {
    listen 80;
    server_name api.hcf-finance.xyz;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}

server {
    listen 80;
    server_name admin.hcf-finance.xyz;
    
    location / {
        proxy_pass http://localhost:3001/admin;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# 2. 切换到临时配置
echo "2. 启用临时配置..."
sudo rm -f /etc/nginx/sites-enabled/hcf-finance
sudo ln -sf /etc/nginx/sites-available/hcf-finance-temp /etc/nginx/sites-enabled/

# 3. 测试并重启Nginx
echo "3. 测试Nginx配置..."
sudo nginx -t

echo "4. 重启Nginx..."
sudo systemctl restart nginx

# 4. 获取SSL证书
echo "5. 获取SSL证书..."
sudo certbot certonly --nginx \
    -d hcf-finance.xyz \
    -d www.hcf-finance.xyz \
    -d api.hcf-finance.xyz \
    -d admin.hcf-finance.xyz \
    --non-interactive \
    --agree-tos \
    --email admin@hcf-finance.xyz

# 5. 创建完整的HTTPS配置
echo "6. 创建完整HTTPS配置..."
sudo tee /etc/nginx/sites-available/hcf-finance-ssl <<EOF
# HTTP重定向到HTTPS
server {
    listen 80;
    server_name hcf-finance.xyz www.hcf-finance.xyz api.hcf-finance.xyz admin.hcf-finance.xyz;
    return 301 https://\$server_name\$request_uri;
}

# 主站和www
server {
    listen 443 ssl http2;
    server_name hcf-finance.xyz www.hcf-finance.xyz;
    
    ssl_certificate /etc/letsencrypt/live/hcf-finance.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hcf-finance.xyz/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}

# API子域名
server {
    listen 443 ssl http2;
    server_name api.hcf-finance.xyz;
    
    ssl_certificate /etc/letsencrypt/live/hcf-finance.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hcf-finance.xyz/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}

# Admin子域名
server {
    listen 443 ssl http2;
    server_name admin.hcf-finance.xyz;
    
    ssl_certificate /etc/letsencrypt/live/hcf-finance.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hcf-finance.xyz/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    location / {
        proxy_pass http://localhost:3001/admin;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# 6. 检查证书是否生成成功
if [ -f "/etc/letsencrypt/live/hcf-finance.xyz/fullchain.pem" ]; then
    echo "7. SSL证书获取成功，启用HTTPS配置..."
    sudo rm -f /etc/nginx/sites-enabled/hcf-finance-temp
    sudo ln -sf /etc/nginx/sites-available/hcf-finance-ssl /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl reload nginx
    
    echo "========================================="
    echo "✅ SSL配置成功！"
    echo "========================================="
    echo ""
    echo "现在可以通过HTTPS访问："
    echo "🌐 主站: https://hcf-finance.xyz"
    echo "🔌 API: https://api.hcf-finance.xyz"
    echo "🔧 管理后台: https://admin.hcf-finance.xyz"
else
    echo "========================================="
    echo "⚠️ SSL证书获取失败"
    echo "========================================="
    echo ""
    echo "可能的原因："
    echo "1. DNS还未生效"
    echo "2. 防火墙阻止了验证"
    echo ""
    echo "临时可以通过HTTP访问："
    echo "🌐 主站: http://hcf-finance.xyz"
    echo "🔌 API: http://api.hcf-finance.xyz"
    echo "🔧 管理后台: http://admin.hcf-finance.xyz"
fi

echo ""
echo "测试命令："
echo "curl -I http://hcf-finance.xyz"
echo "curl -I http://api.hcf-finance.xyz"
echo "curl -I http://admin.hcf-finance.xyz"
