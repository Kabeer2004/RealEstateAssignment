### Database Setup (PostgreSQL with Docker)

This project uses PostgreSQL for data persistence. The easiest way to run it locally, especially on Windows with WSL, is via Docker.

1.  **Install Docker Desktop:** Make sure you have [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running. Ensure it's configured to use the WSL 2 backend.

2.  **Pull the PostgreSQL Image:** Open your terminal (like PowerShell, CMD, or your WSL shell) and run:
    ```bash
    docker pull postgres:latest
    ```

3.  **Run the PostgreSQL Container:** Execute the following command to start a PostgreSQL container. This command will:
    *   `--name capmatch-db`: Name the container for easy reference.
    *   `-e POSTGRES_USER=...`: Set the database user.
    *   `-e POSTGRES_PASSWORD=...`: Set the password for the user.
    *   `-e POSTGRES_DB=...`: Create an initial database.
    *   `-p 5432:5432`: Map port 5432 on your host machine to port 5432 in the container.
    *   `-v capmatch-data:/var/lib/postgresql/data`: Create a Docker volume named `capmatch-data` to persist your database, so you don't lose data when the container is removed.
    *   `-d`: Run the container in detached mode (in the background).

    ```bash
    docker run --name capmatch-db \
      -e POSTGRES_USER=user \
      -e POSTGRES_PASSWORD=password \
      -e POSTGRES_DB=capmatch \
      -p 5432:5432 \
      -v capmatch-data:/var/lib/postgresql/data \
      -d postgres:latest
    ```
    You can stop the container with `docker stop capmatch-db` and start it again with `docker start capmatch-db`.

4.  **Update your Environment File:** Make sure your `backend/.env` file has the correct `DATABASE_URL`, matching the credentials you used above.
    ```env
    DATABASE_URL="postgresql+asyncpg://user:password@localhost/capmatch"
    ```

### Database Migrations (Alembic)

This project uses Alembic to manage database schema migrations.

1.  **Install Backend Dependencies:** If you haven't already, install the required Python packages.
    ```bash
    cd backend
    pip install -r requirements.txt
    ```

2.  **Generate a new migration:** Whenever you change your SQLAlchemy models (in `backend/db/models.py`), you need to generate a new migration script.
    ```bash
    # from within the 'backend' directory
    alembic revision --autogenerate -m "A descriptive message about your changes"
    ```
    This will create a new file in `backend/alembic/versions/`.

3.  **Apply migrations:** To apply the migrations to your database and update the schema, run:
    ```bash
    # from within the 'backend' directory
    alembic upgrade head
    ```
    Your database schema will now match your models.

## **Context**

CapMatch connects institutional lenders to commercial real estate borrowers. We provide dynamic market intelligence for every deal. One of the key features is the "Market Overview" page, where cards display stats (e.g., population growth, job growth, supply pipeline, rent per SF) for a given address.

## **Assignment Objective**

Build a production-grade system that, given any address, dynamically collects and displays data for one specific market card from our Market Overview page. The system should:

-   Take an address as input (e.g., 555 California St, San Francisco, CA)
-   Fetch and aggregate all the data needed to fully populate one *Market Context* card (choose from Population Growth, Job Growth, Supply Pipeline, or Avg Rent PSF)
-   Source all data from credible external APIs or public datasets
-   Output: A deployed full-stack app (backend + frontend) that can, given a list of addresses, instantly generate the Market card for each - graphs, visuals, maps, graphics included.
-   The results for any address should be populated within 30 seconds after the address is entered
-   We will be checking this by giving you a few addresses on a call and verifying that your system generates the full card details for each within the time limit

---

## **Deliverables**

-   Deployed, working app (URL)
-   Public repo (GitHub or similar) with all code, README, and clear setup steps
-   Brief 5-minute Loom/video walkthrough of your approach

---

## **Submission**

-   Deadline: [Set your deadline, e.g., 36 hours from now]
-   Submit: Deployed URLs, repo link, video/walkthrough link
