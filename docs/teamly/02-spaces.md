# Пространство (интеграции)

Источник: https://academy.teamly.ru/at/e8f69e50-e51d-4c58-939c-8ec99b68be49

На всю ширину

Пространство (интеграции)

Получение пространства по идентификатору

Получение списка пространств

Создание пространства

Изменение пространства

Архивирование пространства

Разархивирование пространства

Удаление пространства



# **Получение пространства по идентификатору**

* * *

**Метод**

POST /api/v1/wiki/ql/space



**Параметры**

Параметры полей вывода предназначены для выбора необходимых для получения значений. Нужные поля передать со значением **true**, остальные со значением **false** или не передавать вовсе.

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| query\* | object | Поисковый запрос |
| query\[\_\_filter\]\* | object | Фильтр |
| query\[\_\_filter\]\[id\]\* | string | Идентификатор пространства |
| Поля для вывода |
| query\[id\] | bool | Идентификатор |
| query\[title\] | bool | Заголовок |
| query\[description\] | bool | Описание |
| query\[archived\] | bool | Архивировано |
| query\[avatar\]\[path\] | bool | Путь к аватару |
| query\[user\_permission\] | bool | Разрешение пользователя |
| query\[likes\]\[count\] | bool | Количество лайков |
| query\[pinned\_at\] | bool | Дата закрепления |
| query\[keeping\_type\] | bool | Тип пространства |
| query\[binding\] |  | Привязки |
| query\[binding\]\[id\] | bool | Идентификатор привязки |
| query\[binding\]\[meta\] | bool | Метаданные привязки |
| query\[binding\]\[storage\]\[title\] | bool | Заголовок хранилища привязки |
| query\[binding\]\[type\] | bool | Тип привязки |
| query\[main\_article\] |  | Информация о главной статье |
| query\[main\_article\]\[icon\_color\] | bool | Цвет иконки главной статьи |
| query\[main\_article\]\[id\] | bool | Идентификатор главной статьи |
| Быстрые ссылки |
| query\[shortcut\_links\]\[\_\_pagination\]\[page\] | bool | Номер страницы |
| query\[shortcut\_links\]\[\_\_pagination\]\[per\_page\] | bool | Количество записей на странице |
| query\[shortcut\_links\]\[\_\_sort\]\[created\_at\] | string | Сортировка по дате создания |
| query\[shortcut\_links\]\[id\] | bool | Идентификатор |
| query\[shortcut\_links\]\[link\] | bool | Ссылка |
| query\[shortcut\_links\]\[link\_type\] | bool | Тип ссылки |
| query\[shortcut\_links\]\[title\] | bool | Заголовок |

Пример запроса

```
{
    "query": {
        "__filter": {
            "id": "5019017b-ad03-4c00-bdc0-0952fc1cac88"
        },
        "shortcut_links": {
            "id": true,
            "title": true,
            "link": true,
            "link_type": true,
            "__sort": [
                {
                    "created_at": "desc"
                }
            ],
            "__pagination": {
                "page": 1,
                "per_page": 20
            }
        },
        "id": true,
        "title": true,
        "description": true,
        "pinned_at": true,
        "archived": true,
        "keeping_type": true,
        "user_permission": true,
        "likes": {
            "count": true
        },
        "avatar": {
            "path": true
        },
        "main_article": {
            "id": true,
            "icon_color": true
```

Пример ответа

```
{
  "shortcut_links": {
 "data": [],
 "paginate": {
  "current_page": 1,
  "last_page": 1,
  "per_page": 20,
  "from": null,
  "to": null,
  "total": 0
 }
  },
  "id": "da97b257-dda2-46b2-a2eb-27515f9fff18",
  "title": "Пространство",
  "description": null,
  "pinned_at": null,
  "archived": false,
  "keeping_type": "default",
  "user_permission": null,
  "likes": {
 "count": 0
  },
  "avatar": null,
  "main_article": {
 "id": "e8be8de0-4bf5-420b-bf69-989c16eed1ce",
 "icon_color": null
  },
  "binding": null,
  "schemaProperties": []
}
```





**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 404 | Пространство не найдено |
| 422 | Некорректное тело запроса |



# **Получение списка пространств**

* * *

**Метод**

POST /api/v1/wiki/ql/spaces



**Параметры**

Параметры полей вывода предназначены для выбора необходимых для получения значений. Нужные поля передать со значением **true**, остальные со значением **false** или не передавать вовсе.

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| query\* | object | Поисковый запрос |
| Фильтрация |
| query\[\_\_filter\] | object |  |
| query\[\_\_filter\]\[\_\_nested\] | object |  |
| query\[\_\_filter\]\[\_\_nested\]\[\_\_text\]\[query\] | string | Фильтр по названию |
| query\[\_\_filter\]\[\_\_nested\]\[authors\] | array | Фильтр по идентификаторам авторов |
| query\[\_\_filter\]\[\_\_nested\]\[classifiers\] | array | Фильтр по идентификаторам классификаторов |
| query\[\_\_filter\]\[\_\_nested\]\[create\_from\] | date | Фильтр по дате создания ОТ |
| query\[\_\_filter\]\[\_\_nested\]\[create\_to\] | date | Фильтр по дате создания ДО |
| query\[\_\_filter\]\[\_\_nested\]\[publication\_statuses\] | array | Фильтр по идентификаторам статусов |
| query\[\_\_filter\]\[\_\_nested\]\[spaces\] | array | Фильтр по идентификаторам |
| query\[\_\_filter\]\[\_\_nested\]\[tags\] | array | Фильтр по идентификаторам тэгов |
| query\[\_\_filter\]\[\_\_nested\]\[updated\_from\] | date | Фильтр по дате обновления ОТ |
| query\[\_\_filter\]\[\_\_nested\]\[updated\_to\] | date | Фильтр по дате обновления ДО |
| query\[\_\_filter\]\[\_\_nested\]\[is\_official\_doc\] | bool | Фильтр по официальности |
| query\[\_\_filter\]\[in\_favorite\] | bool | Избранные пространства |
| query\[\_\_filter\]\[archived\] | bool | Архивные пространства |
| query\[\_\_filter\]\[keeping\_types\] | array | Фильтр по типу пространства |
| Сортировка |
| query\[\_\_sort\] | object |  |
| query\[\_\_sort\]\[pinned\_at\] | string | Сортировка по дате закрепления |
| query\[\_\_sort\]\[created\_at\] | string | Сортировка по дате создания |
| query\[\_\_sort\]\[title\] | string | Сортировка по названию |
| Пагинация |
| query\[\_\_pagination\] | object |  |
| query\[\_\_pagination\]\[page\] | int | Текущая страница |
| query\[\_\_pagination\]\[per\_page\] | int | Количество объектов на странице |
| Поля для вывода |
| query\[id\] | bool | Идентификатор |
| query\[title\] | bool | Название |
| query\[description\] | bool | Описание |
| query\[avatar\]\[path\] | bool | Аватар пространства |
| query\[user\_permission\] | bool | Полномочия пользователя |
| query\[nested\_count\]\[article\] | bool | Количество опубликованных статей |
| query\[keeping\_type\] | bool | Тип пространства |
| query\[pinned\_at\] | bool | Дата закрепления |
| query\[author\] |  | Информация об авторе |
| query\[author\]\[id\] | bool | Идентификатор автора |
| query\[author\]\[full\_name\] | bool | Имя автора |
| query\[author\]\[avatar\] | bool | Аватар автора |
| query\[main\_article\] |  | Информация о главной статье |
| query\[main\_article\]\[id\] | bool | Идентификатор |
| query\[main\_article\]\[icon\_color\] | bool | Цвет |
| query\[main\_article\]\[image\]\[cover\_id\] | bool | Изображение |

Пример запроса

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



Пример ответа

```
{
  "data": [
	{
  	"id": "da97b257-dda2-46b2-a2eb-27515f9fff18",
  	"title": "Space Title",
  	"description": null,
  	"author": {
    	"id": "ae425819-eab0-47ad-89c2-452f4d74c0be",
    	"full_name": "Space Owner",
    	"avatar": null
  	},
  	"user_permission": null,
  	"nested_count": {
    	"article": 1
  	},
  	"main_article": {
    	"id": "e8be8de0-4bf5-420b-bf69-989c16eed1ce",
    	"icon_color": null,
    	"image": null
  	},
  	"keeping_type": "default",
  	"avatar": null,
  	"pinned_at": null
	}
  ],
  "paginate": {
	"current_page": 1,
	"last_page": 1,
	"per_page": 20,
	"from": 1,
	"to": 1,
	"total": 1
  }
}
```





**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 422 | Некорректное тело запроса |



# **Создание пространства**

* * *

**Метод**

POST api/v1/space



**Параметры**

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| title\* | string | Название пространства |
| description | string | Описание пространства |
| is\_pinned | bool | Закреплено ли пространство |

Пример запроса

```
{
    "title": "Пространство",
    "description": "Описание",
    "is_pinned": false
}
```



Пример ответа

```
{
  "id":"6f4c0a90-1869-4080-be0e-e56b560581fd",
  "main_article_id":"234d4dde-2f6e-4c6d-b1d9-e3d2fd05c0b1"
}
```





**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 422 | Некорректное тело запроса |



# **Изменение пространства**

* * *

**Метод**

PUT api/v1/space/{spaceId}



**Параметры**

| Параметр | Тип данных | Описание |
| --- | --- | --- |
| title\* | string | Название пространства |
| description | string | Описание пространства |
| is\_pinned | bool | Закреплено ли пространство |

Пример запроса

```
{
    "title": "Пространство",
    "description": "Описание",
    "is_pinned": false
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
| 404 | Пространство не найдено |
| 422 | Некорректное тело запроса |



# **Архивирование пространства**

* * *

**Метод**

PATCH api/v1/space/{spaceId}/archive



**Пример ответа**

```
{
  "success":true
}
```



**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 404 | Пространство не найдено |



# **Разархивирование пространства**

* * *

**Метод**

PATCH api/v1/space/{spaceId}/unarchive



**Пример ответа**

```
{
  "success":true
}
```



**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 404 | Пространство не найдено |



# **Удаление пространства**

* * *

**Метод**

DELETE api/v1/space/{spaceId}



**Пример ответа**

```
{
  "success":true
}
```



**HTTP коды ответа**

| Код ответа | Описание |
| --- | --- |
| 200 | Успешно |
| 404 | Пространство не найдено |
