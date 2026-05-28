# Авторизация

Источник: https://academy.teamly.ru/at/4ecf00c0-0611-475e-a0f5-661effff8c96

На всю ширину

Авторизация

Рефреш действует две недели, после чего потребуется обновить токены.

Получение токенов авторизации

Обновление токена

Пример процесса авторизации на Python

# **Получение токенов авторизации**

* * *

**Метод**

POST https://{{slug}}.[teamly.ru/api/v1/auth/integration/authorize](https://teamly.ru/api/v1/auth/integration/authorize)



**Параметры**

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| client\_id\* | string | Идентификатор интеграции |
| redirect\_uri\* | string | Путь перенаправления |
| client\_secret\* | string | Секретный ключ |
| code\* | string | Ключ авторизации |

Пример запроса

```
{
    "client_id" : "9aab04dc-311d-41a3-83e5-db78cdb9a369",
    "redirect_uri" : "http://test.ru",
    "client_secret" : "YU0dDTWHxxZliGOmSKmZN5a7U2uTS17SXEQ8KguZ",
    "code" : "Ключ авторизации"
}
```



Пример ответа

```
{
  "user": {
    	"id": "ae425819-eab0-47ad-89c2-452f4d74c0be",
    	"name": "Article",
    	"surname": "Author",
    	"fullName": "Article Author",
    	"avatar": null,
    	"email": "authorexample@mail.ru"
  	},
  "token_type" : "Bearer",
  "acces_token" : "Токен авторизации",
  "refresh_token" : "Токен обновления",
  "access_token_expires_at" : "1710855479",
  "refresh_token_expires_at" : "1710855479",
  "accounts" : [{
            "id": "7e4fa1b3-a541-43b4-8dbb-7dc97895d4fa",
            "name": "Account name",
            "slug": "default",
            "type": "main",
            "active": true,
            "avatar": {
                "path": ""
            },
            "created_at": 1676753595,
            "clusterId": 1,
            "clusterDomain": "https://app.teamly.ru"
        }
    ],
  "account_users" : {
        "7e4fa1b3-a541-43b4-8dbb-7dc97895d4fa": {
            "active": true,
            "type": "employee"
        }
    }
}
```





**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 422 | Некорректное тело запроса |

**Пример использования полученных данных**

После получения ответа об успешной авторизации важно запомнить access\_token, slug аккаунта и ключ clusterDomain(для каждого аккаунта свой), так как они будут использоваться во всех запросах к приложению. В качестве типа авторизации использует “Bearer token“. Он передается в заголовке следующим образом “Authorization: Bearer {{access\_token}}. Также в системе есть еще один важный заголовок “X-Account-Slug: {{slug}}“.

Вышеописанные заголовки должны передаваться для каждого API запроса

Итоговый запрос на примере списка пространств:

**Получение списка пространств**

POST {{clusterDomain}}/api/v1/wiki/ql/spaces

| Headers |
| --- |
| X-Account-Slug | {{slug}} |
| Content-Type | application/json |
| Authorization | Bearer {{access\_token}} |

```
{
    "query": {
        "__filter": {
            "keeping_types": [
                "default"
            ],
            "__text": {},
            "__nested": {
                "__text": {
                    "query": ""
                }
            }
        },
        "__sort": [
            {
                "pinned_at": "desc"
            },
            {
                "created_at": "desc"
            }
        ],
        "__pagination": {
            "page": 1,
            "per_page": 20
        },
        "id": true,
        "title": true,
        "description": true,
        "author": {
            "id": true,
            "full_name": true,
            "avatar": true
        },
        "user_permission": true,
        "nested_count": {
            "article": true
```

**сURL**

```
curl --location 'https://app.teamly.ru/api/v1/wiki/ql/spaces' \
--header 'X-Account-Slug: {{slug}}' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer {{access_token}}' \
--data '{
    "query": {
        "__filter": {
            "keeping_types": [
                "default"
            ],
            "__text": {},
            "__nested": {
                "__text": {
                    "query": ""
                }
            }
        },
        "__sort": [
            {
                "pinned_at": "desc"
            },
            {
                "created_at": "desc"
            }
        ],
        "__pagination": {
            "page": 1,
            "per_page": 20
        },
        "id": true,
        "title": true,
        "description": true,
        "author": {
            "id": true,
            "full_name": true,
            "avatar": true
```

# **Обновление токена**

* * *

**Метод**

POST https://{{slug}}.[teamly.ru/api/v1/auth/integration/refresh](https://teamly.ru/api/v1/auth/integration/refresh)



**Параметры**

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| client\_id\* | string | Идентификатор интеграции |
| client\_secret\* | string | Секретный ключ |
| refresh\_token\* | string | Токен обновления |
|  |  |  |

Пример запроса

```
{
    "client_id" : "9aab04dc-310d-41a3-83e5-db78cdb9a369",
    "client_secret" : "YU0dDTWHzzZliGOmSKmZN5a7U2uTS17SXEQ8KguZ",
    "refresh_token" : "Токен обновления"
}
```



Пример ответа

```
{
  "user": {
    	"id": "ae425819-eab0-47ad-89c2-452f4d74c0be",
    	"name": "Article",
    	"surname": "Author",
    	"fullName": "Article Author",
    	"avatar": null,
    	"email": "authorexample@mail.ru"
  	},
  "token_type" : "Bearer",
  "acces_token" : "Токен авторизации",
  "refresh_token" : "Токен обновления",
  "access_token_expires_at" : "1710855479",
  "refresh_token_expires_at" : "1710855479",
  "accounts" : [{
            "id": "7e4fa1b3-a541-43b4-8dbb-7dc97895d4fa",
            "name": "Account name",
            "slug": "default",
            "type": "main",
            "active": true,
            "avatar": {
                "path": ""
            },
            "created_at": 1676753595
        }
    ],
  "account_users" : {
        "7e4fa1b3-a541-43b4-8dbb-7dc97895d4fa": {
            "active": true,
            "type": "employee"
        }
    }
}
```





**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 400 | Неправильный запрос (Ошибка в данных авторизации) |
| 422 | Некорректное тело запроса |

# **Пример процесса авторизации на Python**

* * *

```
import requests
import json
import os
from datetime import datetime

# Конфигурация — заполните эти значения
CONFIG = {
    "slug": "your-slug",  # замените на ваш slug
    "client_id": "9aab04dc-311d-41a3-83e5-db78cdb9a369",  # замените на ваш client_id
    "redirect_uri": "http://test.ru",  # замените на ваш redirect_uri
    "client_secret": "YU0dDTWHxxZliGOmSKmZN5a7U2uTS17SXEQ8KguZ",  # замените на ваш client_secret
    "code": "Ключ авторизации"  # замените на ваш код авторизации
}

# Файл для хранения токенов
TOKEN_FILE = "tokens.json"

def load_tokens():
    """Загружает токены из файла, если он существует."""
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, 'r') as f:
            return json.load(f)
    return None

def save_tokens(tokens):
    """Сохраняет токены в файл."""
    with open(TOKEN_FILE, 'w') as f:
        json.dump(tokens, f, indent=2)

def get_authorization_tokens():
    """Получает токены авторизации."""
    url = f"https://{CONFIG['slug']}.teamly.ru/api/v1/auth/integration/authorize"
    payload = {
        "client_id": CONFIG["client_id"],
        "redirect_uri": CONFIG["redirect_uri"],
        "client_secret": CONFIG["client_secret"],
        "code": CONFIG["code"]
    }
    headers = {'Content-Type': 'application/json'}

    response = requests.post(url, json=payload, headers=headers)

    if response.status_code == 200:
        tokens = response.json()
        save_tokens(tokens)
        print("Токен авторизации успешно получен и сохранён.")
        return tokens
    else:
        print(f"Ошибка получения токенов: {response.status_code}")
        print(response.text)
        return None

def refresh_token(refresh_token):
    """Обновляет токен с использованием refresh_token."""
    url = f"https://{CONFIG['slug']}.teamly.ru/api/v1/auth/integration/refresh"
    payload = {
        "client_id": CONFIG["client_id"],
        "client_secret": CONFIG["client_secret"],
        "refresh_token": refresh_token
    }
    headers = {'Content-Type': 'application/json'}

    response = requests.post(url, json=payload, headers=headers)

    if response.status_code == 200:
        new_tokens = response.json()
        save_tokens(new_tokens)
        print("Токен успешно обновлён и сохранён.")
        return new_tokens
    else:
        print(f"Ошибка обновления токена: {response.status_code}")
        print(response.text)
        return None

def is_token_expired(expires_at):
    """Проверяет, истёк ли токен (по timestamp)."""
    current_timestamp = int(datetime.now().timestamp())
    return current_timestamp >= expires_at

def get_valid_tokens():
    """Возвращает валидные токены — либо из файла, либо обновлённые."""
    tokens = load_tokens()

    if not tokens:
        print("Токены не найдены, запрашиваем новые...")
        return get_authorization_tokens()

    # Проверяем, не истёк ли access_token
    if is_token_expired(int(tokens["access_token_expires_at"])):
        print("Access token истёк, обновляем...")
        return refresh_token(tokens["refresh_token"])

    print("Используем сохранённые токены.")
    return tokens

def make_api_request(endpoint, query_data):
    """Выполняет API-запрос с использованием валидных токенов."""
    tokens = get_valid_tokens()
    if not tokens:
        raise Exception("Не удалось получить валидные токены.")

    slug = CONFIG['slug']
    cluster_domain = None
    for account in tokens["accounts"]:
        if account["slug"] == slug:
            cluster_domain = account["clusterDomain"]

    if cluster_domain is None:
        raise Exception("Не удалось соверщить действие в заданном аккаунте")

    url = f"{cluster_domain}{endpoint}"
    headers = {
        'X-Account-Slug': slug,
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {tokens["access_token"]}'
    }

    response = requests.post(url, json=query_data, headers=headers)

    if response.status_code == 200:
        return response.json()
    else:
        print(f"Ошибка API запроса: {response.status_code}")
        print(response.text)
        return None

if __name__ == "__main__":
    # Пример использования: получаем список пространств
    query_data = {
        "query": {
            "__filter": {
                "keeping_types": ["default"],
                "__text": {},
                "__nested": {
                    "__text": {
                        "query": ""
                    }
                }
            },
            "__sort": [
                {"pinned_at": "desc"},
                {"created_at": "desc"}
            ],
            "__pagination": {
                "page": 1,
                "per_page": 20
            },
            "id": True,
            "title": True,
            "description": True,
            # ... остальные поля согласно документации
        }
    }

    result = make_api_request("/api/v1/wiki/ql/spaces", query_data)
    if result:
        print("Ответ API:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
```
