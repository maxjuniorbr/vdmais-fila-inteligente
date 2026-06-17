import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { StaffLoginDto } from './dto/staff-login.dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Per-IP limits are intentionally generous: REs legitimately share one public
  // IP (ER Wi-Fi NAT and carrier CGNAT on 4G/5G), so a tight per-IP cap would
  // lock out real users at peak. This layer is coarse anti-flood only; the real
  // brute-force defense is the per-credential lock in AuthService.
  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto)
  }

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 40 } })
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  @Post('staff-login')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  staffLogin(@Body() dto: StaffLoginDto) {
    return this.authService.staffLogin(dto)
  }
}
