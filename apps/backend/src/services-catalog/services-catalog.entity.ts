import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
    OneToMany, ManyToOne, JoinColumn
} from 'typeorm';

// ===== SERVICE CATEGORY ENTITY =====
@Entity('service_categories')
export class ServiceCategoryEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index()
    @Column({ unique: true })
    slug: string;

    @Column()
    name: string;

    @Column()
    subtitle: string;

    @Column()
    materialIcon: string;

    @Index()
    @Column({ default: 0 })
    sortOrder: number;

    @Index()
    @Column({ default: true })
    isPublished: boolean;

    @OneToMany(() => ServiceEntity, service => service.category)
    services: ServiceEntity[];

    @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz', default: () => 'now()' })
    updatedAt: Date;
}

// ===== SERVICE ENTITY =====
@Entity('services')
export class ServiceEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index()
    @Column({ unique: true })
    slug: string;

    @Column()
    icon: string;

    @Column()
    title: string;

    @Column('text')
    description: string;

    @Column('text')
    longDescription: string;

    @Column('text', { array: true, default: [] })
    tags: string[];

    @Column('text')
    keywords: string;

    @Index()
    @Column({ default: 0 })
    sortOrder: number;

    @Index()
    @Column({ default: true })
    isPublished: boolean;

    @Index()
    @Column('uuid')
    categoryId: string;

    @ManyToOne(() => ServiceCategoryEntity, category => category.services, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'categoryId' })
    category: ServiceCategoryEntity;

    @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz', default: () => 'now()' })
    updatedAt: Date;
}
