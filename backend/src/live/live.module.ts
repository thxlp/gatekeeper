import { Module } from '@nestjs/common';
import { LiveController } from './live.controller';
import { DeployModule } from '../deploy/deploy.module';

// GitAppStore + DockerRuntimeService มาจาก DeployModule (ไม่ประกาศซ้ำ — DockerRuntimeService
// มี state ภายใน เช่น cache network ที่ต่อแล้ว ควรเป็น instance เดียวกันทั้ง process)
@Module({
  imports: [DeployModule],
  controllers: [LiveController],
})
export class LiveModule {}
