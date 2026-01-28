import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index
} from 'typeorm';

@Entity('faqs')
export class Faq {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index()
    @Column({ unique: true })
    slug: string;

    @Column()
    question: string;

    @Column('text', { array: true })
    answers: string[];

    @Column('text', { array: true, nullable: true })
    listItems: string[] | null;

    @Index()
    @Column({ default: 0 })
    sortOrder: number;

    @Index()
    @Column({ default: true })
    isPublished: boolean;

    @Column({ nullable: true })
    category: string | null;

    @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz', default: () => 'now()' })
    updatedAt: Date;
}
