from locust import HttpUser, between, task
from uuid import uuid4


class StorefrontUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        self.registration_email = f"locust-{uuid4().hex}@example.com"

    def request_and_report(self, method, path, name, allowed_statuses, json=None):
        with self.client.request(
            method,
            path,
            name=f"{name} [allowed]",
            json=json,
            catch_response=True,
        ) as response:
            if response.status_code == 429:
                response.request_meta["name"] = f"{name} [429 rate limited]"
                response.success()
            elif response.status_code in allowed_statuses:
                response.success()
            else:
                response.failure(f"Unexpected HTTP {response.status_code}")

    @task(3)
    def browse_products(self):
        self.request_and_report(
            "GET",
            "/api/products/?skip=0&limit=12",
            "/api/products/",
            {200},
        )

    @task(2)
    def search_products(self):
        self.request_and_report(
            "GET",
            "/api/products/search?q=phone&limit=20",
            "/api/products/search",
            {200},
        )

    @task(1)
    def register(self):
        self.request_and_report(
            "POST",
            "/api/auth/register",
            "/api/auth/register",
            {201, 400},
            {
                "name": "Locust Test User",
                "email": self.registration_email,
                "password": "locust-test-password",
            },
        )

    @task(1)
    def login(self):
        self.request_and_report(
            "POST",
            "/api/auth/login",
            "/api/auth/login",
            {401},
            {"email": "locust-missing@example.com", "password": "not-a-password"},
        )

    @task(1)
    def refresh_token(self):
        self.request_and_report(
            "POST",
            "/api/auth/refresh",
            "/api/auth/refresh",
            {401},
            {"refresh_token": "invalid-locust-refresh-token"},
        )

    @task(1)
    def logout(self):
        self.request_and_report(
            "POST",
            "/api/auth/logout",
            "/api/auth/logout",
            {204},
            {"refresh_token": "invalid-locust-refresh-token"},
        )
