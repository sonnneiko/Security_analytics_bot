# Webhooks

Источник: https://academy.teamly.ru/at/5c11a266-7857-40c6-b8c9-25c89c5a0c4f

На всю ширину

Webhooks

Webhook (Вебхук) — это способ интеграции с TEAMLY, при котором ваш аккаунт отправляет уведомления об изменениях на внешний сервис в режиме реального времени.

**Содержание статьи:**

Создание webhook

Редактирование webhook

Удаление webhook

Общие сведения

Информация о событиях

Доступные сущности

—

Пространство (space)

—

Статья (article)

—

Умная таблица (tbd)

—

Строка Умной таблицы (tbd.body)

—

Свойство (property)

—

Комментарий (comment)

![контекстная картинка](https://app.teamly.ru/api/v1/upload/editor/view?file_id=88490bbc-4b16-49c1-ab66-633443ec3533&source_id=5c11a266-7857-40c6-b8c9-25c89c5a0c4f&source_type=article&bx_token=&account_slug=academy)



# **Создание webhook**

Чтобы создать webhook и указать события, перейдите в **Управление аккаунтом**, затем — в раздел **Интеграция** и откройте вкладку **Webhook**.

Нажмите на **Добавить webhook** в правом верхнем углу и заполните форму создания. Затем проставьте в чек-боксах требуемые события и нажмите на кнопку **Сохранить** .



При возникновении события на указанный в форме URL адрес будет отправлен POST запрос, содержащий информацию об этом событии.



![контекстная картинка](https://app.teamly.ru/api/v1/upload/editor/view?file_id=3cc040ab-96a6-45e1-b7fa-d0cdbf79618e&source_id=5c11a266-7857-40c6-b8c9-25c89c5a0c4f&source_type=article&bx_token=&account_slug=academy)

![контекстная картинка](https://app.teamly.ru/api/v1/upload/editor/view?file_id=2cda840d-9874-4dc1-9fa3-be77b896ee46&source_id=5c11a266-7857-40c6-b8c9-25c89c5a0c4f&source_type=article&bx_token=&account_slug=academy)

⭐️

К одному вебхуку может быть привязано несколько событий.

⭐️

К разным вебхукам можно привязывать одинаковые события.



# **Редактирование webhook**

Чтобы отредактировать название, ссылку перенаправления или описание webhook, нажмите на **Редактировать** на детальной странице и внесите соответствующие изменения в открывшемся окне.

Если вы хотите изменить только ссылку, это можно сделать на детальной странице в поле «Ссылка для перенаправления», а после внесения изменений нажать на **Сохранить** .

![контекстная картинка](https://app.teamly.ru/api/v1/upload/editor/view?file_id=86ff907b-cc1c-4dfb-9d11-ead88b537458&source_id=5c11a266-7857-40c6-b8c9-25c89c5a0c4f&source_type=article&bx_token=&account_slug=academy)

![контекстная картинка](https://app.teamly.ru/api/v1/upload/editor/view?file_id=2c3f697d-ae50-44c2-aa77-21546887d0d1&source_id=5c11a266-7857-40c6-b8c9-25c89c5a0c4f&source_type=article&bx_token=&account_slug=academy)



# **Удаление webhook**

Для удаления webhook нажмите на **Удалить** на детальной странице. У вас откроется окно для подтверждения действия.



Данные после удаления не могут быть восстановлены.

![контекстная картинка](https://app.teamly.ru/api/v1/upload/editor/view?file_id=999eb8d9-9892-401d-9635-b5b423ecdd46&source_id=5c11a266-7857-40c6-b8c9-25c89c5a0c4f&source_type=article&bx_token=&account_slug=academy)

![контекстная картинка](https://app.teamly.ru/api/v1/upload/editor/view?file_id=ab2f02ed-3235-4e98-ab61-ee7b4b11decb&source_id=5c11a266-7857-40c6-b8c9-25c89c5a0c4f&source_type=article&bx_token=&account_slug=academy)



# **Общие сведения**

✅ Успешным ответом на запрос считается ответ с кодом **200-299**, которые ожидаются к получению в течение 30 секунд после отправки события. По истечении указанного времени отправка считается неуспешной.

❌ При неуспешном ответе будут произведены повторные попытки отправки с интервалами (1 минута, 15 минут, 1 час, 24 часа), до прихода успешного ответа или последней неудачной попытки. Также, если была провалена последняя попытка (спустя 24 часа), webhook переводится в состояние **Отключен**.





# **Информация о событиях**

Все сообщения имеют единый формат тела события. Исключением является содержимое поля content — оно отличается в зависимости от типа сущности.



**Формат отправляемых данных**

| Параметр | Значение |
| --- | --- |
| entityId | Идентификатор сущности в формате uuid |
| entityType | Тип сущности |
| action | Тип события |
| content | Дополнительные сведения о событии |



**Доступные типы событий**

| Тип | Значение |
| --- | --- |
| create | Создание |
| update | Обновление |
| garbage | Перенос в корзину |
| restore | Восстановление из корзины |
| archive | Перенос в архив |
| unarchive | Восстановление из архива |
| publish | Публикация (только для статьи) |
| update\_value | Изменение значение свойства |



# **Доступные сущности**

В таблице перечислены все доступные сущности:

| Тип | Значение |
| --- | --- |
| space | Пространство |
| article | Статья |
| tbd | Умная таблица |
| tbd.body | Строка Умной таблицы |
| property | Свойства |
| comment | Комментарий |



Ниже представлены сведения о доступных событиях и дополнительных сведениях по каждой сущности.



## **Пространство (space)**

Доступные события: **create, update, garbage, restore, archive, unarchive**



Событие **create**

Дополнительные сведения о событии:

| Параметр | Тип значения | Описание |
| --- | --- | --- |
| title | string|null | Название |
| description | string|null | Описание |

**Пример сообщения**

```
{
  "entityId": "f59ac633-34b1-4daf-a35b-3f51566feb1c",
  "entityType": "space",
  "action": "create",
  "content" : {
        "title" : "Пространство",
        "description" : "Описание"
  }
}
```



События **update, garbage, restore, archive, unarchive**

Дополнительных сведений о событии нет

**Пример сообщения**

```
{
  "entityId": "f59ac633-34b1-4daf-a35b-3f51566feb1c",
  "entityType": "space",
  "action": "update",
  "content" : {}
}
```



## **Статья (article)**

Доступные события: **create, garbage, restore, archive, unarchive, publish**



События **create, publish**

Дополнительные сведения о событии:

| Параметр | Тип значения | Описание |
| --- | --- | --- |
| containerId | string | Идентификатор пространства, в котором находится статья |

**Пример сообщения**

```
{
    "entityId": "f59ac633-34b1-4daf-a35b-3f51566feb1c",
    "entityType": "article",
    "action": "create",
    "content": {
        "containerId": "73a5bbbd-0ff9-4ef0-8060-e6a7662e3296"
    }
}
```



События **garbage, restore, archive, unarchive**

Параметр **entityId** изменён на **entityIds**

| Параметр | Значение |
| --- | --- |
| entityIds | Массив идентификаторов сущностей в формате uuid |

Дополнительные сведения о событии:

| Параметр | Тип значения | Описание |
| --- | --- | --- |
| containerId | string | Идентификатор пространства, в котором находится статья |

**Пример сообщения**

```
{
    "entityIds": ["f59ac633-34b1-4daf-a35b-3f51566feb1c"],
    "entityType": "article",
    "action": "update",
    "content": {
        "containerId": "73a5bbbd-0ff9-4ef0-8060-e6a7662e3296"
    }
}
```



## **Умная таблица (tbd)**

Доступные события: **create, update, garbage, restore**



Дополнительные сведения о событии:

| Параметр | Тип значения | Описание |
| --- | --- | --- |
| title | string | null | Название |
| description | string | null | Описание |

**Пример сообщения**

```
{
    "entityId": "f59ac633-34b1-4daf-a35b-3f51566feb1c",
    "entityType": "tbd",
    "action": "update",
    "content": {
        "title": "Пространство",
        "description": "Описание"
    }
}
```



## **Строка Умной таблицы (tbd.body)**

Доступные события: **create, garbage, restore, delete**



Событие **create**

Дополнительные сведения о событии:

| Параметр | Тип значения | Описание |
| --- | --- | --- |
| containerId | string | Идентификатор Умной таблицы, в которой находится строка |

**Пример сообщения**

```
{
    "entityId": "f59ac633-34b1-4daf-a35b-3f51566feb1c",
    "entityType": "tbd.body",
    "action": "create",
    "content": {
        "containerId": "73a5bbbd-0ff9-4ef0-8060-e6a7662e3296"
    }
}
```



События **garbage, restore, delete**

Параметр **entityId** изменен на **entityIds**

| Параметр | Значение |
| --- | --- |
| entityIds | Массив идентификаторов сущностей в формате uuid |



Дополнительные сведения о событии:

| Параметр | Тип значения | Описание |
| --- | --- | --- |
| containerId | string | Идентификатор Умной таблицы, в которой находится строка |

**Пример сообщения**

```
{
    "entityIds": ["f59ac633-34b1-4daf-a35b-3f51566feb1c"],
    "entityType": "tbd.body",
    "action": "garbage",
    "content": {
        "containerId": "73a5bbbd-0ff9-4ef0-8060-e6a7662e3296"
    }
}
```



## **Свойство (property)**

Доступные события: **create, update, delete, update\_value**



События **create, update, delete**

Дополнительные сведения о событии:

| Параметр | Тип значения | Описание |
| --- | --- | --- |
| name | string | null | Название |
| type | string | null | Тип |
| format | string | null | Формат |
| сontainerId | string | null | Идентификатор пространства/Умной таблицы |

В параметре **entityId** передаётся идентификатор пространства/Умной таблицы.

**Пример сообщения**

```
{
    "entityId": "f59ac633-34b1-4daf-a35b-3f51566feb1c",
    "entityType": "schemaProperty",
    "action": "update",
    "content": {
        "name": "Свойство",
        "type": "text",
        "format": "text",
        "сontainerId": "f59ac633-34b1-4daf-a35b-3f51566feb1c"
    }
}
```



Событие **update\_value**

Вызов события происходит при изменении значений свойств статьи/строки Умной таблицы.

Список возможных значений свойств представлен в [статье](https://academy.teamly.ru/space/5019017b-ad03-4c00-bdc0-0952fc1cac88/article/becb3de4-f71a-4ae5-a703-12aac6f5a94a#78200952-44d8-4d1a-a86c-e8074b04aab6).



Дополнительные сведения о событии:

| Параметр | Тип значения | Описание |
| --- | --- | --- |
| articleId | string | null | Идентификатор статьи |
| containerId | string | null | Идентификатор Умной таблицы |
| properties | array | null | Значения свойств |

**Пример сообщения**

```
{
    "entityId": "3660a4a4-1cc4-4e59-8bb4-5903bbf1c076",
    "entityType": "property",
    "action": "update_value",
    "content": {
        "articleId": "3660a4a4-1cc4-4e59-8bb4-5903bbf1c076",
        "containerId": "73a5bbbd-0ff9-4ef0-8060-e6a7662e3296",
        "properties": {
            "title": {
                "icon": null,
                "text": "text name"
            },
            "author": {
                "id": "ae425819-eab0-47ad-89c2-452f4d44c0be",
                "fullName": "Article Author",
                "avatarPath": null,
                "externalId": null
            }
        },
    }
}
```



## **Комментарий (comment)**

Доступные события: **create, update, delete**

Формат поля **text** более подробно описан в [статье](https://academy.teamly.ru/space/5019017b-ad03-4c00-bdc0-0952fc1cac88/article/90d277c7-aed6-4e47-8af3-25621ba97700#27a61741-b56d-43de-9e67-fe11c34329d3).



Дополнительные сведения:

| Параметр | Тип значения | Описание |
| --- | --- | --- |
| parentId | string | null | Идентификатор родительского комментария |
| text | string | null | Содержимое комментария |
| simpleText | string | null | Содержимое в упрощённом виде |
| createdBy | string | null | Идентификатор пользователя, создавшего комментарий |
| forSource | array |  |
| forSource\[sourceId\] | string | null | Идентификатор статьи |

**Пример сообщения**

```
{
    "entityId": "f59ac633-34b1-4daf-a35b-3f51566feb1c",
    "entityType": "comment",
    "action": "update",
    "content": {
        "parentId": "73a5bbbd-0ff9-4ef0-8060-e6a7662e3296",
        "text": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"attrs\":{\"id\":\"b548020e-ca87-4200-a4ac-53caa6effaf1\",\"textAlign\":\"left\"},\"content\":[{\"type\":\"text\",\"text\":\"Perfect\"}]}]}",
        "simpleText": "Perfect",
        "createdBy": "ae425819-eab0-47ad-89c2-422f4d74c0be",
        "forSource": {
            "sourceId": "3660a4a4-1cc4-4e59-8bb4-5903bbf1c076",
        }
    }
}
```
