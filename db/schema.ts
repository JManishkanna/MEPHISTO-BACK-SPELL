import { pgTable, integer, text } from 'drizzle-orm/pg-core';

export const contactDetails = pgTable('contact_details', {
  id: integer('id').primaryKey(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  location: text('location').notNull(),
});

export const adminProfiles = pgTable('admin_profiles', {
  userId: text('user_id').primaryKey(),
  displayName: text('display_name').notNull(),
  imagePath: text('image_path'),
});
