-- ============================================================================
-- IITM Test Platform — Development & Local Test Accounts Seed Data
-- ============================================================================
-- FOR LOCAL DEVELOPMENT AND TEST ENVIRONMENTS ONLY.
-- DO NOT RUN AGAINST PRODUCTION CLUSTER.
-- ============================================================================

DO $$
BEGIN
    -- 1. Primary Test Student: test@sst.scaler.com / password123
    INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, aud, role,
        confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
        created_at, updated_at, email_change
    )
    VALUES (
        '6237f208-f1f2-4818-8e3f-86dc027ca850', '00000000-0000-0000-0000-000000000000',
        'test@sst.scaler.com', crypt('password123', gen_salt('bf')), NOW(),
        '{"provider": "email", "providers": ["email"]}',
        '{"role": "student", "full_name": "Test Student"}',
        'authenticated', 'authenticated', '', '', '', '',
        NOW(), NOW(), ''
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        encrypted_password = EXCLUDED.encrypted_password,
        raw_user_meta_data = EXCLUDED.raw_user_meta_data;

    -- 2. Primary Test Admin: admin@gmail.com / password123
    INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, aud, role,
        confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
        created_at, updated_at, email_change
    )
    VALUES (
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
        'admin@gmail.com', crypt('password123', gen_salt('bf')), NOW(),
        '{"provider": "email", "providers": ["email"]}',
        '{"role": "admin", "full_name": "Admin User"}',
        'authenticated', 'authenticated', '', '', '', '',
        NOW(), NOW(), ''
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        encrypted_password = EXCLUDED.encrypted_password,
        raw_user_meta_data = EXCLUDED.raw_user_meta_data;

    -- 3. Sync public.users profiles with auth roles
    INSERT INTO public.users (id, email, role, name)
    VALUES ('6237f208-f1f2-4818-8e3f-86dc027ca850', 'test@sst.scaler.com', 'student', 'Test Student')
    ON CONFLICT (id) DO UPDATE SET role = 'student', name = 'Test Student', email = EXCLUDED.email;

    INSERT INTO public.users (id, email, role, name)
    VALUES ('00000000-0000-0000-0000-000000000001', 'admin@gmail.com', 'admin', 'Admin User')
    ON CONFLICT (id) DO UPDATE SET role = 'admin', name = 'Admin User';

END $$;
