#!/bin/bash

# HCF Finance SSL证书和Nginx配置脚本
# 域名: hcf-finance.xyz

echo "========================================="
echo "HCF Finance SSL证书配置脚本"
echo "域名: hcf-finance.xyz"
echo "========================================="

# 更新系统
echo "1. 更新系统包..."
sudo apt update

# 安装Nginx
echo "2. 安装Nginx..."
sudo apt install -y nginx

# 安装Certbot
echo "3. 安装Certbot..."
sudo apt install -y certbot python3-certbot-nginx

# 创建Nginx配置文件
echo "4. 创建Nginx配置..."
sudo tee /etc/nginx/sites-available/hcf-finance <<EOF
# HTTP配置 - 自动重定向到HTTPS
server {
    listen 80;
    server_name hcf-finance.xyz www.hcf-finance.xyz api.hcf-finance.xyz admin.hcf-finance.xyz;
    
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# 主站配置
server {
    listen 443 ssl;
    server_name hcf-finance.xyz www.hcf-finance.xyz;
    
    # SSL证书将由Certbot自动配置
    
    # 前端DApp
    location / {
        proxy_pass http://localhost:3000;  # 前端端口
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

# API配置
server {
    listen 443 ssl;
    server_name api.hcf-finance.xyz;
    
    # SSL证书将由Certbot自动配置
    
    location / {
        proxy_pass http://localhost:3001;  # 后端API端口
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

# 管理后台配置
server {
    listen 443 ssl;
    server_name admin.hcf-finance.xyz;
    
    # SSL证书将由Certbot自动配置
    
    location / {
        proxy_pass http://localhost:3001/admin;  # 管理后台
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

# 启用站点
echo "5. 启用Nginx站点..."
sudo ln -sf /etc/nginx/sites-available/hcf-finance /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 测试Nginx配置
echo "6. 测试Nginx配置..."
sudo nginx -t

# 重启Nginx
echo "7. 重启Nginx..."
sudo systemctl restart nginx
sudo systemctl enable nginx

# 获取SSL证书
echo "8. 获取Let's Encrypt SSL证书..."
echo "请确保DNS已经生效（可能需要等待5-30分钟）"
echo "按Enter继续..."
read

# 获取证书
sudo certbot --nginx -d hcf-finance.xyz -d www.hcf-finance.xyz -d api.hcf-finance.xyz -d admin.hcf-finance.xyz --non-interactive --agree-tos --email admin@hcf-finance.xyz

# 设置自动续期
echo "9. 设置SSL证书自动续期..."
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -

# 配置防火墙
echo "10. 配置防火墙..."
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3001/tcp
sudo ufw allow 22/tcp
echo "y" | sudo ufw enable

echo "========================================="
echo "✅ 配置完成！"
echo "========================================="
echo ""
echo "访问地址："
echo "🌐 主站: https://hcf-finance.xyz"
echo "🔌 API: https://api.hcf-finance.xyz"
echo "🔧 管理后台: https://admin.hcf-finance.xyz"
echo ""
echo "注意事项："
echo "1. 确保DNS记录已经生效（使用 nslookup hcf-finance.xyz 检查）"
echo "2. 确保后端服务正在运行（端口3001）"
echo "3. SSL证书将自动续期"
echo ""
echo "测试命令："
echo "curl -I https://hcf-finance.xyz"
echo "curl -I https://api.hcf-finance.xyz"
echo "curl -I https://admin.hcf-finance.xyz"
