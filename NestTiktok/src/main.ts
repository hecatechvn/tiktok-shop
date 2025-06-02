import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { UserService } from './user/user.service';

import { setupSwagger } from './config/swagger';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Configure request body size limits
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Enable CORS
  app.enableCors();

  const port = configService.get<number>('PORT');
  const apiPrefix = configService.get<string>('API_PREFIX');
  const apiVersion = configService.get<string>('API_VERSION');

  if (apiPrefix && apiVersion) {
    app.setGlobalPrefix(`${apiPrefix}/v${apiVersion}`);
  }

  setupSwagger(app);

  // Ensure admin user exists
  const userService = app.get(UserService);
  await userService.ensureAdminExists();

  // Add graceful shutdown
  await app.listen(port || 8000);

  console.log(`Application is running on port ${port || 8000}`);
}

bootstrap().catch((error) => {
  console.log(error);
});
