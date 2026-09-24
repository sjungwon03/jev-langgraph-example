module.exports = {
  InjectRepository: () => () => {},
  TypeOrmModule: {
    forRoot: () => ({ module: class {}, providers: [] }),
    forRootAsync: () => ({ module: class {}, providers: [] }),
    forFeature: () => ({ module: class {}, providers: [] }),
  },
  getRepositoryToken: (entity) => `EntityRepository_${entity?.name || 'Token'}`,
};
