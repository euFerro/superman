# Principles

## Depend on interfaces, not implementations

Services, repositories, gateways, and any other dependency should never receive or reference a concrete class directly. Always depend on an **interface** (contract) and inject the implementation.

```typescript
// ✅ Correct — depends on interface
class UsersService implements IUsersService {
  constructor(private readonly repository: IUsersRepository) {}
}

// ❌ Wrong — depends on concrete class
class UsersService {
  constructor(private readonly repository: UsersRepository) {}
}
```

This applies at every layer:
- **Controllers** depend on a service interface (`IUsersService`), never on `UsersService`
- **Services** depend on a repository interface (`IUsersRepository`), never on `UsersRepository`
- **Services** depend on gateway interfaces (`IPaymentGateway`), never on `StripeGateway`

This makes your code testable (swap real implementations for mocks), decoupled (change the database without touching the service), and explicit about its contracts.
