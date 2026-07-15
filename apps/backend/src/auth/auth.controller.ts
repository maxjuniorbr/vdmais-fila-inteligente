import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { StaffLoginDto } from './dto/staff-login.dto'
import { GuestEntryDto } from './dto/guest-entry.dto'
import { throttleLimit } from '../common/throttle-limits'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Per-IP limits are intentionally generous: REs legitimately share one public
  // IP (ER Wi-Fi NAT and carrier CGNAT on 4G/5G), so a tight per-IP cap would
  // lock out real users at peak. This layer is coarse anti-flood only; the real
  // brute-force defense is the per-credential lock in AuthService. These routes
  // are anonymous (no per-user bucket), so events with one shared NAT may need
  // the env override.
  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: throttleLimit('THROTTLE_REGISTER_PER_MINUTE', 20) } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto)
  }

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: throttleLimit('THROTTLE_LOGIN_PER_MINUTE', 40) } })
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  @Post('guest-entry')
  @Throttle({ default: { ttl: 60000, limit: throttleLimit('THROTTLE_GUEST_ENTRY_PER_MINUTE', 20) } })
  @HttpCode(HttpStatus.OK)
  guestEntry(@Body() dto: GuestEntryDto) {
    return this.authService.guestEntry(dto)
  }

  @Post('staff-login')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  staffLogin(@Body() dto: StaffLoginDto) {
    return this.authService.staffLogin(dto)
  }
}
