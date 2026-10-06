import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Role } from '../database/enums';
import { User } from '../database/entities';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.users.exists({ where: { email } })) {
      throw new ConflictException('Ya existe una cuenta con ese correo');
    }
    const user = await this.users.save(
      this.users.create({
        email,
        name: dto.name ?? null,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: Role.CUSTOMER, // el rol ADMIN nunca se asigna desde la API pública
      }),
    );
    return this.session(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email.toLowerCase() } });
    // Mismo mensaje para correo inexistente y clave incorrecta.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    return this.session(user);
  }

  profile(userId: string) {
    return this.users.findOneOrFail({ where: { id: userId }, select: ['id', 'email', 'name', 'role', 'createdAt'] });
  }

  private session(user: User) {
    return {
      accessToken: this.jwt.sign({ sub: user.id, role: user.role }),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }
}
