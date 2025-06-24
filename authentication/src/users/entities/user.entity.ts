import { Role } from 'src/roles/entities/role.entity';
import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 255, type: 'varchar' })
  email: string;

  @Column({ length: 255, type: 'varchar', select: false, nullable: true })
  password: string;

  @Column({ length: 255, type: 'varchar', select: false, nullable: true })
  salt: string;

  // @Column({ name: 'google_id', length: 255, type: 'varchar', nullable: true })
  // google_id: string;

  // @Column({ name: 'linkedin_id', length: 255, type: 'varchar', nullable: true })
  // linkedin_id: string;

  @Column({ length: 255, type: 'varchar', nullable: true })
  provider: string;

  // @Column({ name: 'is_verified', default: false, nullable: true })
  // is_verified: boolean;

  @Column({ length: 255, type: 'varchar', nullable: true })
  secret: string;

  @Column({ type: 'jsonb', nullable: true })
  category: object;

  @Column({ type: 'text', nullable: true })
  jwt_token: string;

  @Column({ name: 'reset_password_token', type: 'varchar', nullable: true })
  resetPasswordToken: string;

  @Column({ name: 'signup_token', type: 'varchar', nullable: true })
  signupToken: string;

  @Column({ name: 'parent_id', type: 'varchar', nullable: true })
  parentId: string; 

  @Column({ type: 'varchar', nullable: true })
  status: string;

  @Column({ length: 255, type: 'varchar', nullable: true })
  first_name: string;

  @Column({ length: 255, type: 'varchar', nullable: true })
  last_name: string;

  @Column({ length: 255, type: 'varchar', nullable: true })
  phone: string;

  @Column({type:'boolean' , nullable: true})
  account_exist: boolean
  
  @Column({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at: Date;

  @ManyToOne(() => Role, (role) => role.id)
  role: Role;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date;
}
