import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeAddress } from '../common/input';
import { PutProfileDto } from './profile.dto';
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}
  async get(address: string) {
    const profile = await this.prisma.walletProfile.findUnique({
      where: { address: normalizeAddress(address) },
    });
    if (!profile)
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: '지갑 프로필을 찾을 수 없습니다.',
      });
    return profile;
  }
  put(address: string, dto: PutProfileDto) {
    address = normalizeAddress(address);
    return this.prisma.walletProfile.upsert({
      where: { address },
      create: { address, name: dto.name },
      update: { name: dto.name },
    });
  }
}
