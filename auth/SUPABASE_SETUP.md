# Supabase Setup Instructions

## 1. Create the `profiles` table

Run this SQL in your Supabase SQL Editor:

```sql
-- Create the profiles table
CREATE TABLE profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create an index on user_id for faster lookups
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
```

## 2. Enable Row Level Security (RLS)

Run this in your Supabase SQL Editor:

```sql
-- Enable RLS on the profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own profile
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy for users to insert their own profile
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy for users to update their own profile
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create policy for users to delete their own profile (optional)
CREATE POLICY "Users can delete their own profile"
  ON profiles FOR DELETE
  USING (auth.uid() = user_id);
```

## 3. Verify Setup

You can verify the table was created by:
1. Going to Supabase Dashboard
2. Click on "SQL Editor"
3. Run: `SELECT * FROM profiles;`

## 4. Test the Application

Your app now supports:
- ✅ Sign up with email, password, age, and gender
- ✅ User profiles table in Supabase
- ✅ Login fetches user profile data
- ✅ Profile page to view and edit profile information

## Important Notes

- The `user_id` is automatically linked to `auth.users(id)`
- When a user signs up, their profile is inserted into the `profiles` table
- When a user logs in, their profile data is fetched and stored in the token object
- RLS policies ensure users can only access their own profile data
