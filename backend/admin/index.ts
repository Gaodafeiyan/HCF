import express from 'express';
import path from 'path';

const adminRouter = express.Router();

// 获取正确的路径 - 使用相对于backend目录的路径
const publicPath = path.join(__dirname, '..', 'admin', 'public');

// 静态文件服务
adminRouter.use('/static', express.static(path.join(publicPath, 'static')));

// 登录页面
adminRouter.get('/login', (req, res) => {
  const loginPath = path.join(publicPath, 'login.html');
  console.log('Serving login page from:', loginPath);
  res.sendFile(loginPath);
});

// 后台管理主页
adminRouter.get('/', (req, res) => {
  const indexPath = path.join(publicPath, 'index.html');
  console.log('Serving admin page from:', indexPath);
  res.sendFile(indexPath);
});

export default adminRouter;
