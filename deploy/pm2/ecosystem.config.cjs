module.exports = {
  apps: [
    {
      name: 'fullstack-server',
      cwd: '/var/www/fullstack/apps/server',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production',
        PORT: 3334,
      },
      error_file: '/var/log/fullstack/server-error.log',
      out_file: '/var/log/fullstack/server-out.log',
      time: true,
    },
  ],
};
