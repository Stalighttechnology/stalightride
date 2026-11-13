import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import connection, models, transaction
from psycopg.types.json import Json

from core.db import as_owner


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **metadata):
        """Create the login and its auth.users row in one transaction.

        The auth.users insert fires on_auth_user_created, which creates the
        profile and the customer role.
        """
        user = self.model(email=self.normalize_email(email).lower())
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        with transaction.atomic(), as_owner():
            user.save(using=self._db)
            with connection.cursor() as c:
                c.execute(
                    "INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (%s, %s, %s)",
                    [user.id, user.email, Json(metadata)],
                )
        return user


class User(AbstractBaseUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    objects = UserManager()

    def delete(self, *args, **kwargs):
        # auth.users cascades to profiles, roles, bookings and the rest.
        with transaction.atomic(), as_owner():
            with connection.cursor() as c:
                c.execute("DELETE FROM auth.users WHERE id = %s", [self.id])
            return super().delete(*args, **kwargs)
