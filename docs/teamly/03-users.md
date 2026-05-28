# Пользователи

Источник: https://academy.teamly.ru/at/ba28a7f1-a984-491d-99ce-c4a10ce2d7a2

На всю ширину

Пользователи

В TEAMLY есть два вида аккаунтов:

-   **SaaS** — облачные аккаунты;

-   **On-premises** — коробочное решение.


Для каждого решения есть свои особенности по хранению и управлению пользователями, поэтому спецификация описана для каждого решения отдельно, чтобы вам было удобно пользоваться той частью спецификации, с которой вы собираетесь работать.

**Содержание статьи:**

SaaS version

—

Получить список пользователей

—

Пригласить пользователя

—

Изменить пользователя

—

Удалить пользователя

—

Получить лимиты пользователей для аккаунта

On-premises version

—

Получить список пользователей

—

Создать пользователя

—

Изменить пользователя

—

Удалить пользователя

—

Получить лимиты пользователей для аккаунта



# **SaaS version**

* * *

## **Получить список пользователей**

POST api/v1/ql/account-users

**Параметры**

Параметры полей вывода предназначены для выбора необходимых для получения значений. Нужные поля передать со значением **true**, остальные — со значением **false** или не передавать вовсе.

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| query\[id\] | boolean | Идентификатор связи пользователя с аккаунтом |
| query\[userId\] | boolean | Идентификатор пользователя |
| query\[extUserId\] | boolean | Внешний идентификатор пользователя (при наличии интеграций) |
| query\[name\] | boolean | Имя |
| query\[surname\] | boolean | Фамилия |
| query\[workPosition\] | boolean | Должность |
| query\[active\] | boolean | Статус активный/неактивный |
| query\[userType\] | boolean | Тип пользователя |
| query\[userRole\] | boolean | Роль пользователя |
| query\[visitedAt\] | boolean | Последняя активность |
| query\[avatar\] |  |  |
| query\[avatar\]\[path\] | boolean | Путь к аватару |
| query\[user\] |  |  |
| query\[user\]\[email\] | boolean | E-mail пользователя |
| query\[user\]\[avatar\]\[path\] | boolean | Путь к аватару |
| query\[community\] |  |  |
| query\[community\]\[id\] | boolean | Идентификатор отдела |
| query\[community\]\[externalId\] | boolean | Внешний идентификатор отдела (при наличии интеграций) |
| query\[community\]\[title\] | boolean | Название отдела |
| query\[\_\_filter\] |  | Фильтры |
| query\[\_\_filter\]\[\_\_text\]\[query\] | string | Текстовый фильтр |
| query\[\_\_filter\]\[types\] | array | null | По типу (guest, employee, null — все) |
| query\[\_\_filter\]\[in\_groups\] | array | По принадлежности к группе |
| query\[\_\_filter\]\[roles\] | array | null | По роли (reader, editor, admin, null — все) |
| query\[\_\_filter\]\[active\] | bool | По статусу |
| query\[\_\_filter\]\[lastActiveFrom\]query\[\_\_filter\]\[lastActiveTo\] | date(dd.mm.yyyy) | По периоду последней активности |
| query\[\_\_sort\] |  | Сортировка |
| query\[\_\_sort\]\[role\] | asc/desc | По роли |
| query\[\_\_sort\]\[type\] | asc/desc | По типу |
| query\[\_\_sort\]\[active\] | asc/desc | По статусу |
| query\[\_\_sort\]\[visitedAt\] | asc/desc | По дате последней активности |
| query\[\_\_sort\]\[createdAt\] | asc/desc | По дате создания |
| query\[\_\_pagination\] |  | Пагинация |
| query\[\_\_pagination\]\[page\] | int | Номер страницы |
| query\[\_\_pagination\]\[perPage\] | int | Количество элементов на странице |

Пример запроса

```
{
    "query": {
        "__filter": {
            "__text": {
                "query": ""
            },
            "types": ["employee"],
            "roles": null,
            "lastActiveFrom":"10.01.2024",
            "lastActiveTo":"15.02.2024"
        },
        "__sort": [
            {
                "createdAt": "desc"
            }
        ],
        "__pagination": {
            "page": 1,
            "perPage": 20
        },
        "id": true,
        "userId": true,
        "extUserId": true,
        "name": true,
        "surname": true,
        "workPosition": true,
        "active": true,
        "userType": true,
        "userRole": true,
        "avatar": {
            "path": true
        },
        "user": {
            "email": true,
            "avatar": {
                "path": true
```

Пример ответа

```
{
    "items": [
        {
            "id": "9540f4ae-3ace-4205-a21c-6833fcce0c84",
            "userId": "9a11eedc-0540-3fa4-ae83-0b314d915393",
            "extUserId": null,
            "name": "Name",
            "surname": "Surname",
            "workPosition": null,
            "active": true,
            "userType": {
                "code": "employee",
               "name": "\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a"
            },
            "userRole": {
                "code": "admin",
                "name": "\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440"
            },
            "avatar": null,
            "user": {
                "email": "test@teamly.ru",
                "avatar": null
            },
            "visitedAt": 1715940215,
            "community": {
                "id": "ce7d724f-65f2-4eb3-876f-33711978444a",
                "externalId": null,
                "title": "Test community"
            }
        }
    ],
    "pagination": {
        "currentPage": 1,
        "lastPage": 1,
        "perPage": 20,
        "from": 1,
```



**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 403 | Доступ запрещён |
| 422 | Некорректное тело запроса |



## **Пригласить пользователя**

POST api/v1/account-users/invite

**Параметры**

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| communityId | string | Идентификатор отдела |
| type\* | string | Тип пользователя (employee, guest) |
| emails\* | array | Массив e-mail адресов (не более 50 шт) |

Пример запроса

```
{
    "communityId": "20f1850c-cd8f-3dbc-bdbc-73a7437171ec",
    "type": "employee",
    "emails": [
        "test_found@teamly.ru",
        "test_created@teamly.ru",
        "test_updated@teamly.ru"
    ]
}
```

| Статусы создания пользователя |
| --- |
| created | пользователь создан |
| found | пользователь уже существует |
| updated | удалённый пользователь восстановлен |

Пример ответа

```
{
    "test_found@teamly.ru": {
        "status": "found",
        "content": {
            "id": "fc7e3e34-be39-4570-bd9f-0b2e3e901a05",
            "userId": "2480a6e3-39c6-4332-95e7-29adf0f8fd46"
        }
    },
    "test_created@teamly.ru": {
        "status": "created",
        "content": {
            "id": "fc7e3e34-be39-4570-bd9f-0b2e3e901a05",
            "userId": "2480a6e3-39c6-4332-95e7-29adf0f8fd46"
        }
    },
    "test_updated@teamly.ru": {
        "status": "updated",
        "content": {
            "id": "fc7e3e34-be39-4570-bd9f-0b2e3e901a05",
            "userId": "2480a6e3-39c6-4332-95e7-29adf0f8fd46"
        }
    }
}
```





**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 403 | Доступ запрещён |
| 422 | Некорректное тело запроса |



## **Изменить** **пользователя**

PUT api/v1/account-users/{id}

id — Идентификатор связи пользователя с аккаунтом

**Параметры**

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| active | bool | Статус активный/неактивный |
| name | string | Имя |
| surname | string | Фамилия |
| workPosition | string | Должность |
| role | string | Роль (reader — читатель, editor — редактор , admin — администратор) |
| avatarId | string | Идентификатор изображения |
| communityId | string | Идентификатор отдела |

Пример запроса изменения одного поля

```
{"role":"editor"}
```

Пример запроса изменения множества полей

```
{
    "role": "editor",
    "name" : "Name",
    "surname" : "Surname"
}
```

Пример ответа

```
{
   "success":true
}
```



**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 400 | Неправильный запрос |
| 403 | Доступ запрещён |
| 404 | Пользователь не найден |
| 422 | Некорректное тело запроса |

## **Удалить пользователя**

В Saas версии нельзя удалить сотрудника, который импортирован из Bitrix24

DELETE api/v1/account-users/{id}

id - Идентификатор связи пользователя с аккаунтом

Пример ответа

```
{
   "success":true
}
```



**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 403 | Доступ запрещён |
| 404 | Пользователь не найден |



## **Получить лимиты пользователей для аккаунта**

GET api/v1/accounts/{accountId}/user-info

**Параметры** **ответа**

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| active | int | Количество активных сущностей |
| total | int | Общее количество сущностей |
| max | int | Максимальное доступное количество сущностей |

Пример ответа

```
{
    "users": {
        "active": 31,
        "total": 546,
        "max": 1102
    },
    "editors": {
        "active": 28,
        "total": 289,
        "max": 1002
    }
}
```



**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 403 | Доступ запрещён |
| 404 | Аккаунт не найден |



# **On-premises version**

* * *

## **Получить список пользователей**

POST api/v1/ql/account-users

**Параметры**

Параметры полей вывода предназначены для выбора необходимых для получения значений. Нужные поля передать со значением **true**, остальные — со значением **false** или не передавать вовсе.

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| query\[id\] | boolean | Идентификатор связи пользователя с аккаунтом |
| query\[userId\] | boolean | Идентификатор пользователя |
| query\[extUserId\] | boolean | Внешний идентификатор пользователя (при наличии интеграций) |
| query\[name\] | boolean | Имя |
| query\[surname\] | boolean | Фамилия |
| query\[workPosition\] | boolean | Должность |
| query\[active\] | boolean | Статус активный/неактивный |
| query\[userType\] | boolean | Тип пользователя |
| query\[userRole\] | boolean | Роль пользователя |
| query\[visitedAt\] | boolean | Последняя активность |
| query\[avatar\] |  |  |
| query\[avatar\]\[path\] | boolean | Путь к аватару |
| query\[user\] |  |  |
| query\[user\]\[email\] | boolean | E-mail пользователя |
| query\[user\]\[avatar\]\[path\] | boolean | Путь к аватару |
| query\[community\] |  |  |
| query\[community\]\[id\] | boolean | Идентификатор отдела |
| query\[community\]\[externalId\] | boolean | Внешний идентификатор отдела (при наличии интеграций) |
| query\[community\]\[title\] | boolean | Название отдела |
| query\[\_\_filter\] |  | Фильтры |
| query\[\_\_filter\]\[\_\_text\]\[query\] | string | Текстовый фильтр |
| query\[\_\_filter\]\[types\] | array | null | По типу (guest, employee, null — все) |
| query\[\_\_filter\]\[in\_groups\] | array | По принадлежности к группе |
| query\[\_\_filter\]\[roles\] | array | null | По роли (reader, editor, admin, null — все) |
| query\[\_\_filter\]\[active\] | bool | По статусу |
| query\[\_\_filter\]\[lastActiveFrom\]query\[\_\_filter\]\[lastActiveTo\] | date(dd.mm.yyyy) | По периоду последней активности |
| query\[\_\_sort\] |  | Сортировка |
| query\[\_\_sort\]\[role\] | asc/desc | По роли |
| query\[\_\_sort\]\[type\] | asc/desc | По типу |
| query\[\_\_sort\]\[active\] | asc/desc | По статусу |
| query\[\_\_sort\]\[visitedAt\] | asc/desc | По дате последней активности |
| query\[\_\_sort\]\[createdAt\] | asc/desc | По дате создания |
| query\[\_\_pagination\] |  | Пагинация |
| query\[\_\_pagination\]\[page\] | int | Номер страницы |
| query\[\_\_pagination\]\[perPage\] | int | Количество элементов на странице |

Пример запроса

```
{
    "query": {
        "__filter": {
            "__text": {
                "query": ""
            },
            "types": ['employee'],
            "roles": null,
            "lastActiveFrom":"10.01.2024",
            "lastActiveTo":"15.02.2024"
        },
        "__sort": [
            {
                "createdAt": "desc"
            }
        ],
        "__pagination": {
            "page": 1,
            "perPage": 20
        },
        "id": true,
        "userId": true,
        "extUserId": true,
        "name": true,
        "surname": true,
        "workPosition": true,
        "active": true,
        "userType": true,
        "userRole": true,
        "avatar": {
            "path": true
        },
        "user": {
            "email": true,
            "avatar": {
                "path": true
```



Пример ответа

```
{
    "items": [
        {
            "id": "9540f4ae-3ace-4205-a21c-6833fcce0c84",
            "userId": "9a11eedc-0540-3fa4-ae83-0b314d915393",
            "extUserId": null,
            "name": "Name",
            "surname": "Surname",
            "workPosition": null,
            "active": true,
            "userType": {
                "code": "employee",
               "name": "\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a"
            },
            "userRole": {
                "code": "admin",
                "name": "\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440"
            },
            "avatar": null,
            "user": {
                "email": "test@teamly.ru",
                "avatar": null
            },
            "visitedAt": 1715940215,
            "community": {
                "id": "ce7d724f-65f2-4eb3-876f-33711978444a",
                "externalId": null,
                "title": "Test community"
            }
        }
    ],
    "pagination": {
        "currentPage": 1,
        "lastPage": 1,
        "perPage": 20,
        "from": 1,
```



**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 403 | Доступ запрещён |
| 422 | Некорректное тело запроса |

## **Создать пользователя**

POST api/v1/account-users

**Параметры**

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| type\* | string | Тип пользователя (employee) |
| active\* | boolean | Статус активный/неактивный |
| name\* | string | Имя |
| surname | string | Фамилия |
| workPosition | string | Должность |
| email\* | string | Логин |
| password\* | string | Пароль |
| communityId | string | Идентификатор отдела |
| avatarId | string | Идентификатор изображения |

Пример запроса

```
{
    "type": "employee",
    "active": false,
    "name": "Name",
    "surname" : "Surname",
    "workPosition" : "Designer",
    "email": "test_created@teamly.ru",
    "password": "Qwerty123"
}
```

Пример ответа

```
{
    "id": "20d7a53f-113f-44ed-b678-02f6776da0f5",
    "userId": "1404af06-0f4a-4bc8-b71e-03a789db69eb"
}
```



**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 403 | Доступ запрещён |
| 422 | Некорректное тело запроса |

## **Изменить пользователя**

PUT api/v1/account-users/{id}

id — Идентификатор связи пользователя с аккаунтом

**Параметры**

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| active | bool | Статус активный/неактивный |
| name | string | Имя |
| surname | string | Фамилия |
| workPosition | string | Должность |
| role | string | Роль |
| email | string | Логин |
| password | string | Пароль |
| avatarId | string | Идентификатор изображения |
| communityId | string | Идентификатор отдела |

Пример запроса

```
{
   "email":"test_update@teamly.ru"
}
```

Пример ответа

```
{
   "success":true
}
```



**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 403 | Доступ запрещён |
| 404 | Пользователь не найден |
| 422 | Некорректное тело запроса |

##
**Удалить пользователя**

В On-premises версии нельзя удалить сотрудника, который импортирован из Bitrix24/Active-directory

DELETE api/v1/account-users/{id}

id — Идентификатор связи пользователя с аккаунтом

Пример ответа

```
{
   "success":true
}
```



**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 403 | Доступ запрещён |
| 404 | Пользователь не найден |

## **Получить лимиты пользователей для аккаунта**

GET api/v1/accounts/{accountId}/user-info

**Параметры ответа**

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| active | int | Количество активных сущностей |
| total | int | Общее количество сущностей |
| max | int | Максимальное доступное количество сущностей |

Пример ответа

```
{
    "users": {
        "active": 31,
        "total": 546,
        "max": 1102
    },
    "editors": {
        "active": 28,
        "total": 289,
        "max": 1002
    }
}
```



**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 403 | Доступ запрещён |
| 404 | Аккаунт не найден |
