const serverPath = process.env.SERVER_PATH || '/var/www/fullstack';
const currentPath = `${serverPath}/current`;

module.exports = {
  apps: [
    {
      name: 'fullstack-server',
      cwd: `${currentPath}/apps/server`,
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production',
        PORT: 3334,
        SERVER_PATH: serverPath,
      },
      error_file: '/var/log/fullstack/server-error.log',
      out_file: '/var/log/fullstack/server-out.log',
      time: true,
    },
  ],
};
