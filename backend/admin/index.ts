import express from 'express';
import path from 'path';

const adminRouter = express.Router();

// 静态文件服务
adminRouter.use('/static', express.static(path.join(__dirname, 'public', 'static')));

// 登录页面
adminRouter.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 后台管理主页
adminRouter.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

export default adminRouter;
