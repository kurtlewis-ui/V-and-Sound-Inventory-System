import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async create(createUserDto: CreateUserDto, createdBy: string, actorRole?: string) {
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Verify role exists
    const role = await this.prisma.role.findUnique({
      where: { id: createUserDto.roleId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Admin cannot create Owner accounts
    if (actorRole === 'Admin' && role.name === 'Owner') {
      throw new ForbiddenException('Admins cannot create Owner accounts');
    }

    // Verify branch exists if provided
    if (createUserDto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: createUserDto.branchId, deletedAt: null },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
    }

    // Hash password
    const bcryptRounds = parseInt(this.config.get<string>('BCRYPT_ROUNDS') ?? '12', 10) || 12;
    const passwordHash = await bcrypt.hash(createUserDto.password, bcryptRounds);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        passwordHash,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        middleInitial: createUserDto.middleInitial?.trim() || null,
        roleId: createUserDto.roleId,
        phone: createUserDto.phone,
        branchId: createUserDto.branchId ?? null,
        avatarUrl: createUserDto.avatarUrl || null,
        mustChangePassword: true, // Force password change on first login
      },
      include: {
        role: true,
        branch: true,
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        userId: createdBy,
        action: 'USER_CREATED',
        entityType: 'User',
        entityId: user.id,
        newValues: {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: role.name,
          branchId: user.branchId,
        },
      },
    });

    // Remove password hash from response
    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async findAll(query: QueryUserDto, actorRole?: string) {
    const {
      page = 1,
      limit = 20,
      search,
      roleId,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      deletedAt: null,
    };

    // Role-based visibility:
    // - Owner sees all users (Owner + Admin + Staff)
    // - Admin sees only Admin + Staff (Owner accounts are hidden)
    if (actorRole === 'Admin') {
      where.role = { name: { in: ['Admin', 'Staff'] } };
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (roleId) {
      where.roleId = roleId;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    // Get total count
    const total = await this.prisma.user.count({ where });

    // Get users
    const users = await this.prisma.user.findMany({
      where,
      include: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip,
      take: limit,
    });

    // Remove password hashes
    const usersWithoutPasswords = users.map(({ passwordHash, ...user }) => user);

    return {
      data: usersWithoutPasswords,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        role: true,
        branch: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Remove password hash
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async update(id: string, updateUserDto: UpdateUserDto, updatedBy: string, actorRole?: string) {
    // Get current user
    const currentUser = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        role: true,
      },
    });

    if (!currentUser) {
      throw new NotFoundException('User not found');
    }

    // Admin cannot edit Owner accounts
    if (actorRole === 'Admin' && currentUser.role.name === 'Owner') {
      throw new ForbiddenException('Admins cannot edit Owner accounts');
    }

    // If changing role, verify new role exists
    if (updateUserDto.roleId) {
      const newRole = await this.prisma.role.findUnique({
        where: { id: updateUserDto.roleId },
      });

      if (!newRole) {
        throw new NotFoundException('Role not found');
      }
    }

    // Check email uniqueness if being changed
    if (updateUserDto.email && updateUserDto.email !== currentUser.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException('Email already exists');
      }
    }

    // Verify branch exists if branchId is being set (skip null = unassign)
    if (updateUserDto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: updateUserDto.branchId, deletedAt: null },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
    }

    // Update user
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      include: {
        role: true,
        branch: true,
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        userId: updatedBy,
        action: 'USER_UPDATED',
        entityType: 'User',
        entityId: id,
        oldValues: {
          firstName: currentUser.firstName,
          lastName: currentUser.lastName,
          email: currentUser.email,
          roleId: currentUser.roleId,
          branchId: currentUser.branchId,
          isActive: currentUser.isActive,
        },
        newValues: updateUserDto as unknown as Prisma.InputJsonValue,
      },
    });

    // Remove password hash
    const { passwordHash, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async resetPassword(
    id: string,
    newPassword: string,
    confirmPassword: string,
    resetBy: string,
  ) {
    if (newPassword !== confirmPassword) {
      throw new BadRequestException('New passwords do not match');
    }

    // Get the target user
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Hash and store the new password
    const bcryptRounds = parseInt(this.config.get<string>('BCRYPT_ROUNDS') ?? '12', 10) || 12;
    const passwordHash = await bcrypt.hash(newPassword, bcryptRounds);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedLoginAttempts: 0,
        isLocked: false,
      },
    });

    // Force the user to log in again with the new password
    await this.prisma.session.deleteMany({
      where: { userId: id },
    });

    // Audit log (never store the password value)
    await this.prisma.auditLog.create({
      data: {
        userId: resetBy,
        action: 'USER_PASSWORD_RESET',
        entityType: 'User',
        entityId: id,
      },
    });

    return { message: 'Password updated successfully' };
  }

  async remove(id: string, deletedBy: string) {
    // Get user
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent self-deletion
    if (id === deletedBy) {
      throw new BadRequestException('Cannot delete your own account');
    }

    // Soft delete
    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    // Delete all user sessions
    await this.prisma.session.deleteMany({
      where: { userId: id },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        userId: deletedBy,
        action: 'USER_DELETED',
        entityType: 'User',
        entityId: id,
        oldValues: {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      },
    });

    return { message: 'User deleted successfully' };
  }

  async findArchived(query: QueryUserDto) {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: { not: null } };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.user.count({ where });

    const users = await this.prisma.user.findMany({
      where,
      include: {
        role: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { deletedAt: 'desc' },
      skip,
      take: limit,
    });

    const usersWithoutPasswords = users.map(({ passwordHash, ...user }) => user);

    return {
      data: usersWithoutPasswords,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async restore(id: string, restoredBy: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: { not: null } },
    });

    if (!user) {
      throw new NotFoundException('Archived user not found');
    }

    // Block restore if the email is now used by an active account.
    const conflict = await this.prisma.user.findFirst({
      where: { email: user.email, deletedAt: null, NOT: { id } },
    });
    if (conflict) {
      throw new ConflictException(
        'An active user already uses that email. Resolve the conflict before restoring.',
      );
    }

    const restored = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: null, isActive: true },
      include: { role: true, branch: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: restoredBy,
        action: 'USER_RESTORED',
        entityType: 'User',
        entityId: id,
        newValues: { email: user.email },
      },
    });

    const { passwordHash, ...userWithoutPassword } = restored;
    return userWithoutPassword;
  }

  async getRoles() {
    return this.prisma.role.findMany({
      select: {
        id: true,
        name: true,
        description: true,
      },
    });
  }
}
