# Backend Venue Profile

## Github Package Private

Pastikan anda sudah set di laptop/pc anda untuk terhubung ke Github Package Private. Lakukan ini hanya 1x saja, jika sudah, tidak perlu set lagi.

Tutorial: https://github.com/base-pojokan/documentation/blob/main/github-package.md

## Publish Rule

### Branch Default
- Branch Main => Production
- Branch Staging => Developement

**Selalu Pull Request ke Branch Staging**

### Issue Branch

- Ambil ID Issue dari Trello
- Gunakan ID tersebut menjadi nama branch, misalnya ID 5 maka nama branch **issue-5**
- Push ke dalam branch tersebut
- Lakukan Pull Request ke Branch Staging

## API List

| Type | Route | Description |
| ---- | ----- | ----------- |
| GET | /orders | Detail Profile Venue |

## Development

- Clone Repository

```
git clone git@github.com:Appitzr-Project/Backend-Orders.git
```

- Copy **.env.example** ke **.env**

```
cp -r .env.example .env
```

- Install Package dengan Yarn

```
npm ci
```

- Start Serverless Offline

```
npm run dev
```

## Header Token

Jika butuh token, silahkan ambil ketika login dari **https://dev.appetizr.co/**, karena di local tidak ada middleware untuk pengecekan token, token di cek di AWS API Gateway

## .env.example File

Di dalam file ini ada default **COGNITO_POOL_ID**, tidak perlu dirubah, karena ketika development, tidak perlu cognito di local pc/laptop