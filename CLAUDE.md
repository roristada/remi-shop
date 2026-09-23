# CLAUDE.md

## Project: Digital File Store

This file contains the engineering rules, architecture principles, development workflow, and coding conventions for this project.

Claude Code must read and follow this file before making any changes to the codebase.

---

# 1. Project Overview

This is a single-seller e-commerce platform for selling digital files used with drawing and digital-art software.

Typical products include:

- Brushes
- Textures
- Presets
- Patterns
- Fonts
- Templates
- Digital Assets
- Software-related files
- Other digital-art resources

The seller is the only administrator.

Customers must authenticate before purchasing.

Payment is handled manually using a QR Payment displayed by the store. Customers upload a payment slip, and the admin manually verifies the payment.

After payment approval, customers can securely download purchased files.

The website primarily uses Thai language and supports English as a secondary language.

---

# 2. Core Business Flow

The main customer flow is:

Home
→ Shop
→ Product
→ Add to Cart
→ Login/Register
→ Checkout
→ QR Payment
→ Upload Payment Slip
→ Waiting for Verification
→ Admin Approval
→ Download

Rejected payment:

Upload Slip
→ Admin Reject
→ Reject Reason
→ Customer uploads a new slip
→ Admin reviews again

---

# 3. Technology Stack

Use the existing project stack when possible.

Target stack:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide React
- Supabase
- PostgreSQL
- Prisma
- Supabase Auth
- Supabase Storage
- Zod
- Resend or another suitable email provider

Do not replace the stack unless there is a strong technical reason.

Do not introduce a new framework or major library for a problem that can be solved using the existing stack.

---

# 4. Architecture

High-level architecture:

```text
Customer
   │
   ▼
Next.js
   │
   ├── Supabase Auth
   │
   ├── Prisma
   │      │
   │      ▼
   │   Supabase PostgreSQL
   │
   └── Supabase Storage
          │
          ├── Product Files
          ├── Product Preview Images
          └── Payment Slips
```

Responsibilities:

### Next.js

- UI
- Routing
- Server Components
- Server Actions
- Route Handlers
- Server-side authorization
- Business logic orchestration

### Supabase Auth

- Authentication
- Session management
- Email verification
- Password reset

### Prisma

- Application database access
- Queries
- Transactions
- Database schema management where appropriate

### Supabase PostgreSQL

Stores application data.

### Supabase Storage

Stores:

- Digital product files
- Payment slips
- Product preview images
- User avatars

---

# 5. Critical Architecture Rules

## Rule 1 — Never trust the client

Never trust client-provided:

- Price
- Discount
- Total
- Product status
- Payment status
- User ID
- Admin role
- Download permission
- File path
- Storage path

All security-sensitive values must be verified server-side.

---

## Rule 2 — Digital files must be private

Actual product files must never be stored in a public bucket.

Use a private Supabase Storage bucket.

Download flow:

```text
Client
 ↓
Authenticated Request
 ↓
Server Authorization
 ↓
Verify Order
 ↓
Verify Payment
 ↓
Verify Product/File Permission
 ↓
Generate short-lived Signed URL
 ↓
Download
```

Never expose permanent public URLs for purchased files.

---

## Rule 3 — Service Role Key is server-only

Never expose:

```text
SUPABASE_SERVICE_ROLE_KEY
```

to the browser.

Never prefix it with:

```text
NEXT_PUBLIC_
```

Only use the service role key in trusted server-side code.

---

## Rule 4 — Authentication is not authorization

A logged-in user is not automatically an admin.

Always distinguish:

```text
Authenticated User
```

from:

```text
Authorized Admin
```

Admin operations must perform server-side authorization checks.

---

# 6. Authentication

Use Supabase Auth.

Supported:

- Register
- Login
- Logout
- Email verification
- Forgot password
- Reset password

Customer must be authenticated before purchasing.

Do not implement a separate password system unless explicitly required.

Never store plain-text passwords.

---

# 7. Authorization

Application roles:

```text
CUSTOMER
ADMIN
```

Admin authorization must be checked server-side.

Never rely only on:

- Hidden UI
- Client state
- Cookies controlled by the client
- LocalStorage
- Frontend role values

The UI can hide admin functionality, but the server must still enforce authorization.

---

# 8. Database

Database:

```text
Supabase PostgreSQL
```

ORM:

```text
Prisma
```

Use UUIDs for primary keys where appropriate.

Core entities:

```text
Profile
Category
Product
ProductImage
ProductVersion
ProductVersionFile
Wishlist
Cart
CartItem
Order
OrderItem
Payment
Download
Announcement
PaymentSetting
StoreSetting
```

Supabase Auth owns:

```text
auth.users
```

Application profile data belongs in:

```text
public.profiles
```

Do not duplicate authentication credentials in application tables.

---

# 9. Database Design Principles

Use normalized relational design.

Avoid storing multiple related records in JSON when a relational table is more appropriate.

Examples:

Do not store product files as:

```text
Product.files = [...]
```

Prefer:

```text
Product
   │
   └── ProductVersion
           │
           └── ProductVersionFile
```

Use foreign keys.

Use unique constraints where necessary.

Use indexes for:

- Foreign keys
- Slugs
- Order numbers
- Email lookups where appropriate
- Status filtering
- Date filtering
- Search-related queries

Avoid unnecessary indexes.

---

# 10. Database Changes

Before modifying Prisma schema:

1. Inspect the current schema.
2. Check existing relations.
3. Check whether the requested field already exists.
4. Check existing migrations.
5. Determine whether existing data could be affected.
6. Make the smallest safe schema change.

Never casually delete or rename existing columns.

Never reset production database.

Never use destructive migrations without explicit confirmation.

---

# 11. Supabase RLS

Supabase Row Level Security must be treated as an important security layer.

Customer should only access their own:

- Profile
- Cart
- Wishlist
- Orders
- Order Items
- Downloads

Customers must never access another customer's:

- Orders
- Payment slips
- Downloads
- Personal information

Product public access should only expose appropriate published product information.

Sensitive tables require restrictive policies.

Do not create broad policies such as:

```sql
USING (true)
```

for sensitive application data.

If using server-side privileged access, ensure the service role is never exposed to the client.

---

# 12. Storage

Recommended buckets:

```text
product-previews
digital-files
payment-slips
avatars
```

Permissions:

### product-previews

Can be public or safely served through public/CDN access.

### digital-files

PRIVATE

### payment-slips

PRIVATE

### avatars

Public or private depending on implementation.

Never make `digital-files` public.

---

# 13. File Upload Rules

Digital product file:

Maximum:

```text
5 MB per file
```

Allowed file types depend on the product type, but the application must validate:

- File extension
- MIME type
- File size
- Filename
- Storage path

Where practical, validate file signatures instead of relying only on extensions.

Never trust the filename supplied by the browser.

Generate safe storage paths.

---

# 14. Payment Slip Rules

Supported formats:

```text
JPG
JPEG
PNG
WEBP
```

Maximum:

```text
5 MB
```

Store slips in the private:

```text
payment-slips
```

bucket.

Suggested path:

```text
payment-slips/{year}/{month}/{orderId}/{generated-file-name}
```

Never allow a customer to select another user's order ID.

The server must associate the uploaded slip with the authenticated user's order.

---

# 15. Product Rules

A product can have:

- Multiple files
- Multiple preview images
- Multiple versions
- Software compatibility
- License information
- Sale period
- Discount period

Each product file:

```text
<= 5 MB
```

---

# 16. Product Status

Supported statuses:

```text
DRAFT
SCHEDULED
ACTIVE
DISABLED
ENDED
```

Status must be determined server-side based on:

- Published state
- Sale start
- Sale end
- Admin state

Do not trust a status sent by the client.

---

# 17. Selling Period

Products can have:

```text
saleStartAt
saleEndAt
```

Before start:

Cannot purchase.

During period:

Can purchase.

After end:

Cannot purchase.

The product detail page may remain accessible after the sale ends.

Display:

```text
Sale Ended
```

---

# 18. Discount

There are no coupons in V1.

Discount is configured directly on the product.

Fields:

```text
discountPercent
discountStartAt
discountEndAt
```

Discount is active only when:

```text
now >= discountStartAt
AND
now <= discountEndAt
```

Price must be calculated server-side.

Never trust:

```text
discountPrice
```

from the client.

---

# 19. Pricing

Pricing is security-sensitive.

At checkout, server must:

1. Load product from database.
2. Verify product availability.
3. Verify sale period.
4. Verify discount period.
5. Calculate current price.
6. Create order.
7. Snapshot purchase price.

Order must retain the actual price paid.

Changing a Product price later must not modify historical Orders.

---

# 20. Cart

Digital products normally have:

```text
quantity = 1
```

Prevent duplicate copies of the same product in the cart.

Before checkout, revalidate:

- Product exists
- Product is purchasable
- Sale period
- Current price
- Discount
- Product status

Never assume the cart is still valid just because it was valid when originally added.

---

# 21. Order

Order status:

```text
PENDING_PAYMENT
WAITING_REVIEW
PAYMENT_REJECTED
COMPLETED
CANCELLED
```

Payment status:

```text
WAITING
REVIEWING
APPROVED
REJECTED
```

Do not combine all states into one field.

---

# 22. Order Snapshot

OrderItem should snapshot important product information:

- Product name
- Product version
- Unit price
- Discount
- Final price

This prevents future product edits from changing historical orders.

---

# 23. Payment Verification

Payment is manually reviewed by the admin.

Flow:

```text
Order Created
 ↓
WAITING_REVIEW
 ↓
Admin Reviews Slip
 ↓
 ┌───────────────┐
 │               │
Approve        Reject
 │               │
 ▼               ▼
COMPLETED    PAYMENT_REJECTED
 │               │
 ▼               ▼
Download      Upload New Slip
```

Reject must support a reason.

---

# 24. Download Authorization

A customer can download a file only when:

```text
User is authenticated
AND
User owns the order
AND
Payment is approved
AND
Download permission exists
```

Download endpoint must perform all checks server-side.

Never authorize download using only a token.

A token must be combined with proper authorization.

---

# 25. Signed URLs

Use short-lived Supabase Storage signed URLs.

Recommended expiration:

Approximately:

```text
5–10 minutes
```

Do not generate permanent download URLs.

---

# 26. Download Limits

Support:

```text
Unlimited
5
10
Custom
```

Default:

```text
Unlimited
```

Record download events.

Download record should contain at least:

```text
userId
orderId
productId
productFileId
downloadedAt
```

Only collect IP/User-Agent if there is a clear business or security requirement and it is documented appropriately.

---

# 27. Product Versioning

Products support versions.

Example:

```text
Watercolor Brush Pack

v1.0
v1.1
v2.0
```

ProductVersion contains:

```text
versionNumber
releaseDate
releaseNotesTH
releaseNotesEN
isLatest
```

ProductVersionFile contains:

```text
versionId
fileName
storagePath
fileSize
fileType
sortOrder
```

Only one version should be the latest version.

Use database constraints or transactional logic to maintain this rule.

---

# 28. Customer Version Access

A customer who purchased a product can access the appropriate version according to the product's rules.

Default behavior:

Purchased products receive access to the latest version.

Do not remove access to a previously purchased product simply because the product price changes.

---

# 29. Product Preview

Product preview images can be multiple.

Support:

- Main image
- Gallery images
- Sort order
- Alt text
- Primary image

Use optimized Next.js image handling.

Product preview images should not expose actual downloadable files.

---

# 30. Wishlist

Customer can:

- Add product
- Remove product
- View wishlist

Use a unique constraint:

```text
userId + productId
```

to prevent duplicates.

---

# 31. Internationalization

Languages:

```text
TH
EN
```

Default:

```text
TH
```

URL:

```text
/th
/en
```

Static UI strings must use translation files.

Product content should support:

```text
nameTH
nameEN
descriptionTH
descriptionEN
```

Do not use machine translation automatically during page rendering.

---

# 32. UI / Design

Primary:

```text
#F5BFD4
```

Secondary:

```text
#DEF1F6
```

Background:

```text
#FEFEFF
```

Text:

```text
#333333
```

Secondary Text:

```text
#777777
```

Design principles:

- Soft
- Clean
- Modern
- Minimal
- Premium
- Digital-art oriented
- Good whitespace
- Rounded cards
- Subtle shadows
- Subtle animation

Do not overuse pink.

---

# 33. Component Principles

Prefer reusable components.

Examples:

```text
ProductCard
ProductPrice
DiscountBadge
CountdownTimer
ProductGallery
FileList
WishlistButton
CartItem
OrderStatusBadge
PaymentStatusBadge
UploadSlip
DownloadButton
AdminTable
ConfirmDialog
EmptyState
ErrorState
LoadingSkeleton
```

Before creating a new component, search the project for an existing component that can be reused.

Do not duplicate nearly identical components.

---

# 34. Server vs Client Components

Prefer Server Components by default.

Use Client Components only when interactivity requires them.

Typical Client Components:

- Countdown
- Cart interactions
- Form interactions
- Image gallery
- Wishlist button
- Upload UI
- Filters
- Interactive admin tables

Do not mark entire pages as `"use client"` unless necessary.

---

# 35. Business Logic Separation

Do not put complex business logic directly inside UI components.

Prefer:

```text
lib/
├── pricing/
├── orders/
├── payments/
├── downloads/
├── products/
├── storage/
├── auth/
└── validation/
```

Examples:

```text
calculateProductPrice()
validateProductPurchase()
createOrder()
approvePayment()
rejectPayment()
canDownloadProduct()
createSignedDownloadUrl()
```

Business logic should be testable independently from the UI.

---

# 36. Validation

Use Zod for input validation.

Validate both:

Client:

For UX

Server:

For security

Server validation is mandatory.

Never assume client validation is enough.

---

# 37. API Design

API endpoints should follow consistent conventions.

Examples:

```text
/api/products
/api/products/[id]

/api/cart
/api/cart/items

/api/orders
/api/orders/[id]

/api/payments
/api/payments/[id]/approve
/api/payments/[id]/reject

/api/download/[token]
```

Use correct HTTP methods.

Prefer:

```text
GET
POST
PATCH
DELETE
```

Return consistent error responses.

---

# 38. Error Handling

Never expose internal stack traces to users.

Use friendly messages.

Server logs should contain useful debugging information.

Client should receive safe errors.

Example:

```json
{
  "success": false,
  "error": {
    "code": "PRODUCT_NOT_AVAILABLE",
    "message": "This product is no longer available."
  }
}
```

Do not return:

- Database credentials
- SQL errors
- Stack traces
- Service Role keys
- Internal storage paths when unnecessary

---

# 39. Loading / Empty / Error States

Every important page must handle:

### Loading

Use Skeleton UI where appropriate.

### Empty

Example:

```text
No products found.
```

### Error

Example:

```text
Something went wrong.
Please try again.
```

### Success

Example:

```text
Payment slip uploaded successfully.
```

Do not leave blank screens.

---

# 40. Performance

Optimize for:

- Fast initial page load
- Low JavaScript usage
- Server Components
- Image optimization
- Pagination
- Efficient database queries
- Appropriate indexes
- Caching
- Lazy loading

Never fetch all products/orders/files when only a page is needed.

Use pagination.

---

# 41. Database Query Rules

Before writing a query:

1. Check existing Prisma queries.
2. Check indexes.
3. Fetch only required fields where practical.
4. Avoid N+1 queries.
5. Use relations efficiently.
6. Use pagination for lists.
7. Use transactions for multi-step atomic operations.

Do not use `findMany()` without considering pagination for potentially large datasets.

---

# 42. Transactions

Use database transactions when multiple changes must succeed or fail together.

Examples:

Order creation:

```text
Create Order
+
Create Order Items
```

Payment approval:

```text
Update Payment
+
Update Order
+
Grant Download Permission
```

Product version update:

```text
Create Version
+
Set Previous Latest = false
+
Set New Latest = true
```

The exact implementation can vary, but data consistency must be preserved.

---

# 43. Concurrency

Consider race conditions for:

- Checkout
- Product sale ending
- Discount ending
- Payment approval
- Download limits
- Setting latest product version

Never assume two requests cannot happen simultaneously.

Important state changes should be protected by:

- Database constraints
- Transactions
- Atomic updates
- Server-side validation

---

# 44. Time Handling

All server-side business dates must use a consistent timezone strategy.

Store timestamps in UTC where practical.

Convert to Thai timezone for display:

```text
Asia/Bangkok
```

Do not rely on the user's browser clock for:

- Sale end
- Discount end
- Payment deadlines
- Order validity

Server/database time is authoritative.

---

# 45. Countdown Timer

Countdown timers are UI only.

The countdown must not determine whether a discount is valid.

Actual discount validity must always be calculated server-side.

The browser countdown is only a visual representation.

---

# 46. SEO

Product pages should support:

- SEO title
- Meta description
- Open Graph
- Canonical URL
- Product structured data

Generate:

```text
sitemap.xml
robots.txt
```

Do not expose private download URLs in search engines.

---

# 47. Accessibility

Follow reasonable WCAG practices.

Ensure:

- Keyboard navigation
- Visible focus
- Accessible labels
- Alt text
- Sufficient contrast
- Semantic HTML
- Accessible dialogs
- Accessible forms

Do not use color alone to communicate status.

---

# 48. Admin UX

Admin UI should prioritize speed.

Important admin actions:

- Payment Review
- Product Management
- Order Management

Payment Review should be easy to process quickly.

Recommended layout:

```text
Payment Review
 ├── Pending
 ├── Approved
 └── Rejected
```

Show the slip and order information together.

---

# 49. Admin Dashboard

Display:

Today:

- Revenue
- Orders
- Pending Reviews

This Month:

- Revenue
- Orders
- Customers
- Products Sold

Charts:

- Revenue over time
- Orders over time
- Top products
- Sales by category

Do not over-engineer analytics in V1.

---

# 50. Email

Email events:

- Registration / verification
- Password reset
- Order created
- Slip submitted
- Payment approved
- Payment rejected

Use reusable email templates.

Do not put business logic inside email templates.

---

# 51. Environment Variables

Expected variables may include:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

DATABASE_URL=
DIRECT_URL=

RESEND_API_KEY=
```

Never commit real secrets.

Maintain:

```text
.env.example
```

with placeholder values only.

---

# 52. Git Rules

Make focused changes.

Prefer small commits.

Example:

```text
feat: add product version management
fix: validate discount period server-side
feat: add payment slip review
fix: protect digital file downloads
refactor: extract pricing service
```

Do not mix unrelated changes in one commit.

Never rewrite Git history unless explicitly requested.

Never force push without explicit confirmation.

---

# 53. Dependency Rules

Before installing a new package:

1. Check whether the functionality already exists.
2. Check whether an existing dependency can solve it.
3. Check package compatibility.
4. Check whether the dependency is actively maintained.
5. Avoid unnecessary dependencies.

Do not install multiple libraries that solve the same problem.

---

# 54. File Creation Rules

Before creating a new file:

1. Search for an existing implementation.
2. Search for similar components.
3. Reuse existing utilities where possible.
4. Follow existing project conventions.

Do not create:

```text
utils2.ts
helper2.ts
ProductCardNew.tsx
ProductCardFinal.tsx
```

just because an existing implementation is inconvenient.

Refactor the existing implementation instead.

---

# 55. Code Quality

Prefer:

- Small functions
- Explicit types
- Meaningful names
- Reusable utilities
- Early returns
- Clear error handling
- Simple control flow

Avoid:

- Giant components
- Giant functions
- Deep nesting
- Any type unless unavoidable
- Duplicate business logic
- Magic numbers
- Hard-coded secrets
- Hard-coded URLs
- Hard-coded configuration

---

# 56. TypeScript Rules

Use strict TypeScript.

Avoid:

```ts
any
```

unless absolutely necessary.

Prefer:

```ts
unknown
```

with proper narrowing.

Define types for:

- API responses
- Database service results where useful
- Form data
- Product states
- Order states
- Payment states

Use enums or union types consistently.

---

# 57. Logging

Server logs should be useful but must not leak sensitive information.

Never log:

- Passwords
- Access tokens
- Service role keys
- Full payment slips
- Sensitive personal information unnecessarily

Useful log examples:

```text
Order created
Payment approved
Payment rejected
Download authorization failed
Storage upload failed
```

Use structured logging if the project already supports it.

---

# 58. Security Checklist

Before considering a feature complete, verify:

- Authentication
- Authorization
- Input validation
- RLS
- Storage permissions
- Server-side validation
- Rate limiting where appropriate
- No secret leakage
- No public digital files
- No insecure download endpoint
- No client-controlled pricing
- No unauthorized admin action

---

# 59. Testing Strategy

Priority testing areas:

## High Priority

- Authentication
- Authorization
- Pricing
- Discount
- Sale Period
- Order Creation
- Payment Approval
- Payment Rejection
- Download Permission
- Storage Security

## Medium Priority

- Cart
- Wishlist
- Product Search
- Product Version

## UI

Test:

- Mobile
- Tablet
- Desktop
- Loading
- Empty
- Error
- Success

---

# 60. Development Workflow

Claude must follow this workflow.

## Step 1 — Inspect

Before modifying anything:

- Inspect project structure.
- Inspect package.json.
- Inspect relevant files.
- Inspect Prisma schema.
- Inspect Supabase integration.
- Inspect existing components.
- Inspect environment configuration.

Do not assume the project is empty.

---

## Step 2 — Plan

Before making a significant change:

Explain:

- What will change
- Why
- Which files are affected
- Whether database changes are required
- Whether Supabase configuration changes are required
- Security implications
- Testing approach

For small obvious changes, a long explanation is not required.

---

## Step 3 — Implement

Implement the smallest correct change.

Do not refactor unrelated code.

Do not introduce unrelated features.

---

## Step 4 — Validate

After implementation:

Run appropriate checks:

```text
TypeScript
ESLint
Tests
Build
```

Also verify:

- Database schema
- Prisma migration
- Supabase RLS
- Storage permissions
- Authentication
- Authorization

---

## Step 5 — Review

Before finishing:

Check:

- Security
- Error handling
- Edge cases
- Mobile UI
- Performance
- Duplicate code
- Type safety

---

# 61. Work in Phases

Do not implement the entire project in one operation.

Recommended phases:

```text
Phase 1
Foundation

Phase 2
Database + Supabase

Phase 3
Authentication

Phase 4
Products

Phase 5
Storefront

Phase 6
Cart + Checkout

Phase 7
Payment Review

Phase 8
Secure Downloads

Phase 9
Customer Account

Phase 10
Admin

Phase 11
Email

Phase 12
SEO + Security + Performance
```

Complete and validate each phase before moving to the next.

---

# 62. Requirement Clarification Rule

Ask the user before implementing if an unclear requirement affects:

- Database architecture
- Authentication
- Authorization
- Payment
- Storage
- Security
- Pricing
- Order state
- Download permissions

Do not silently invent business rules.

For low-impact UI details, use reasonable defaults and keep them easy to change.

---

# 63. Scope Control

V1 should NOT include:

- Multi-vendor
- Affiliate
- Commission
- Subscription
- Loyalty points
- Advanced CRM
- Complex coupon engine
- Multiple currencies
- Marketplace functionality
- Automated payment gateway

Do not implement these unless explicitly requested.

---

# 64. Current V1 Features

Required:

```text
Authentication
Thai / English
Product Catalog
Categories
Search
Product Detail
Product Preview
Multiple Product Files
Product Version
Software Compatibility
License
Cart
Checkout
QR Payment
Payment Slip Upload
Manual Payment Review
Payment Approve
Payment Reject
Reject Reason
Secure Download
Download History
Download Limit
Wishlist
Sale Period
Discount Period
Discount Countdown
Admin Dashboard
Product Management
Order Management
Payment Review
Customer Management
Sales Report
Announcement / Banner
Email Notification
SEO
Responsive UI
Supabase RLS
Supabase Storage Security
```

---

# 65. Acceptance Criteria

The feature is not complete until:

1. It works server-side.
2. It works on mobile and desktop where applicable.
3. Validation exists.
4. Authorization exists.
5. Error handling exists.
6. Loading/empty states exist.
7. Relevant tests pass.
8. TypeScript passes.
9. Lint passes.
10. Build passes.
11. Sensitive files remain private.
12. No client-controlled security-sensitive values are trusted.

---

# 66. First Task When Starting This Project

Before writing code:

1. Inspect the entire existing project structure.
2. Inspect package.json.
3. Inspect current Next.js version.
4. Inspect current Prisma version.
5. Inspect Prisma schema.
6. Inspect Supabase configuration.
7. Inspect authentication implementation.
8. Inspect existing components.
9. Inspect existing routes.
10. Inspect environment variables.
11. Identify reusable code.
12. Identify technical debt that directly blocks implementation.

Then provide a concise report:

```text
Current Architecture
Existing Features
Missing Features
Files to Modify
Files to Create
Database Changes
Supabase Changes
Environment Variables
Dependencies
Potential Risks
Recommended Implementation Order
```

Do NOT immediately rewrite the project.

Do NOT immediately create the entire application.

Wait until the project has been analyzed.

---

# 67. Final Principle

The goal is not to generate the maximum amount of code.

The goal is to build a:

- Secure
- Maintainable
- Performant
- Simple
- Scalable
- Production-ready

digital product store.

Prefer the simplest architecture that correctly satisfies the requirements.

When uncertain:

1. Inspect first.
2. Reuse existing code.
3. Ask if the decision affects architecture or business rules.
4. Make the smallest safe change.
5. Validate before moving on.
